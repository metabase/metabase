import _ from "underscore";

// primary field types used for picking operators, etc
export const NUMBER = "NUMBER";
export const STRING = "STRING";
export const BOOLEAN = "BOOLEAN";
export const DATE_TIME = "DATE_TIME";
export const LOCATION = "LOCATION";
export const COORDINATE = "COORDINATE";

// other types used for various purporses
export const ENTITY = "ENTITY";
export const SUMMABLE = "SUMMABLE";
export const CATEGORY = "CATEGORY";
export const DIMENSION = "DIMENSION";

export const UNKNOWN = "UNKNOWN";

// define various type hierarchies
// NOTE: be sure not to create cycles using the "other" types
const TYPES = {
    [DATE_TIME]: {
        base: ["DateTimeField", "DateField", "TimeField"],
        special: ["timestamp_milliseconds", "timestamp_seconds"]
    },
    [NUMBER]: {
        base: ["IntegerField", "DecimalField", "FloatField", "BigIntegerField"],
        special: ["number"]
    },
    [STRING]: {
        base: ["CharField", "TextField"],
        special: ["name"]
    },
    [BOOLEAN]: {
        base: ["BooleanField"]
    },
    [COORDINATE]: {
        special: ["latitude", "longitude"]
    },
    [LOCATION]: {
        special: ["city", "country", "state", "zip_code"]
    },

    [ENTITY]: {
        special: ["fk", "id", "name"]
    },

    [SUMMABLE]: {
        include: [NUMBER]
    },
    [CATEGORY]: {
        base: ["BooleanField"],
        special: ["category"],
        include: [LOCATION]
    },
    [DIMENSION]: {
        field: ["dimension"],
        include: [DATE_TIME, CATEGORY, ENTITY]
    }
};

export function isFieldType(type, field) {
    let def = TYPES[type];
    // check to see if it belongs to any of the field types:
    for (let prop of ["field", "base", "special"]) {
        if (def[prop] && _.contains(def[prop], field[prop+"_type"])) {
            return true;
        }
    }
    // recursively check to see if it's another field th:
    if (def.include) {
        for (let includeType of def.include) {
            if (isFieldType(includeType, field)) {
                return true;
            }
        }
    }
    return false;
}

export function getFieldType(field) {
    // try more specific types first, then more generic types
    for (let type of [DATE_TIME, LOCATION, COORDINATE, NUMBER, STRING, BOOLEAN]) {
        if (isFieldType(type, field)) {
            return type;
        }
    }
}

export const isDate = isFieldType.bind(null, DATE_TIME);
export const isNumeric = isFieldType.bind(null, NUMBER);
export const isBoolean = isFieldType.bind(null, BOOLEAN);
export const isSummable = isFieldType.bind(null, SUMMABLE);
export const isCategory = isFieldType.bind(null, CATEGORY);
export const isDimension = isFieldType.bind(null, DIMENSION);


// operator argument constructors:

function freeformArgument(field, table) {
    return {
        type: "text"
    };
}

function numberArgument(field, table) {
    return {
        type: "number"
    };
}


function comparableArgument(field, table) {
    if (isNumeric(field)) {
        return {
            type: "number"
        };
    }

    if (isDate(field)) {
        return {
            type: "date"
        };
    }

    return {
        type: "text"
    };
}


function equivalentArgument(field, table) {
    if (isBoolean(field)) {
        return {
            type: "select",
            values: [
                { key: true, name: "Verdadeiro" },
                { key: false, name: "Falso" }
            ]
        };
    }

    if (isCategory(field)) {
        if (field.id in table.field_values && table.field_values[field.id].length > 0) {
            let validValues = table.field_values[field.id];
            validValues.sort();
            return {
                type: "select",
                values: validValues
                    .filter(value => value != null)
                    .map(value => ({
                        key: value,
                        name: value
                    }))
            };
        }
    }

    if (isDate(field)) {
        return {
            type: "date"
        };
    }

    if (isNumeric(field)) {
        return {
            type: "number"
        };
    }

    return {
        type: "text"
    };
}

function longitudeFieldSelectArgument(field, table) {
    return {
        type: "select",
        values: table.fields
            .filter(field => field.special_type === "longitude")
            .map(field => ({
                key: field.id,
                name: field.display_name
            }))
    };
}

const OPERATORS = {
    "=": {
        validArgumentsFilters: [equivalentArgument],
        multi: true
    },
    "!=": {
        validArgumentsFilters: [equivalentArgument],
        multi: true
    },
    "IS_NULL": {
        validArgumentsFilters: []
    },
    "NOT_NULL": {
        validArgumentsFilters: []
    },
    "<": {
        validArgumentsFilters: [comparableArgument]
    },
    "<=": {
        validArgumentsFilters: [comparableArgument]
    },
    ">": {
        validArgumentsFilters: [comparableArgument]
    },
    ">=": {
        validArgumentsFilters: [comparableArgument]
    },
    "INSIDE": {
        validArgumentsFilters: [longitudeFieldSelectArgument, numberArgument, numberArgument, numberArgument, numberArgument],
        placeholders: ["Selecione o campo de longitude", "Digite a latitude superior", "Digite a longitude esquerda", "Digite a latitude inferior", "Digite a latitude direita"]
    },
    "BETWEEN": {
        validArgumentsFilters: [comparableArgument, comparableArgument]
    },
    "STARTS_WITH": {
        validArgumentsFilters: [freeformArgument]
    },
    "ENDS_WITH": {
        validArgumentsFilters: [freeformArgument]
    },
    "CONTAINS": {
        validArgumentsFilters: [freeformArgument]
    }
};

// ordered list of operators and metadata per type
const OPERATORS_BY_TYPE_ORDERED = {
    [NUMBER]: [
        { name: "=",       verboseName: "Igual" },
        { name: "!=",      verboseName: "Diferente" },
        { name: ">",       verboseName: "Maior que" },
        { name: "<",       verboseName: "Menor que" },
        { name: "BETWEEN", verboseName: "Entre" },
        { name: ">=",      verboseName: "Maio ou igual a", advanced: true },
        { name: "<=",      verboseName: "Menor ou igual a", advanced: true },
        { name: "IS_NULL", verboseName: "É vazio", advanced: true },
        { name: "NOT_NULL",verboseName: "Não é vazio", advanced: true }
    ],
    [STRING]: [
        { name: "=",       verboseName: "É" },
        { name: "!=",      verboseName: "Não é" },
        { name: "IS_NULL", verboseName: "É vazio", advanced: true },
        { name: "NOT_NULL",verboseName: "Não é vazio", advanced: true }
    ],
    [DATE_TIME]: [
        { name: "=",       verboseName: "É" },
        { name: "<",       verboseName: "Antes" },
        { name: ">",       verboseName: "Depois" },
        { name: "BETWEEN", verboseName: "Entre" },
        { name: "IS_NULL", verboseName: "É vazio", advanced: true },
        { name: "NOT_NULL",verboseName: "Não é vazio", advanced: true }
    ],
    [LOCATION]: [
        { name: "=",       verboseName: "É" },
        { name: "!=",      verboseName: "Não é" },
        { name: "IS_NULL", verboseName: "É vazio", advanced: true },
        { name: "NOT_NULL",verboseName: "Não é vazio", advanced: true }
    ],
    [COORDINATE]: [
        { name: "=",       verboseName: "É" },
        { name: "!=",      verboseName: "Não é" },
        { name: "INSIDE",  verboseName: "Dentro" }
    ],
    [BOOLEAN]: [
        { name: "=",       verboseName: "É", multi: false, defaults: [true] },
        { name: "IS_NULL", verboseName: "É vazio" },
        { name: "NOT_NULL",verboseName: "Não é vazio" }
    ],
    [UNKNOWN]: [
        { name: "=",       verboseName: "É" },
        { name: "!=",      verboseName: "Não é" },
        { name: "IS_NULL", verboseName: "É vazio", advanced: true },
        { name: "NOT_NULL",verboseName: "Não é vazio", advanced: true }
    ]
};

const MORE_VERBOSE_NAMES = {
    "equal": "é igual a",
    "not equal": "não é igual a",
    "before": "é antes",
    "after": "é depois",
    "not empty": "não é vazio",
    "less than": "é menor do que",
    "greater than": "é melhor que",
    "less than or equal to": "é inferior ou igual a",
    "greater than or equal to": "é maior do que ou igual a",
}

function getOperators(field, table) {
    let type = getFieldType(field) || UNKNOWN;
    return OPERATORS_BY_TYPE_ORDERED[type].map(operatorForType => {
        let operator = OPERATORS[operatorForType.name];
        let verboseNameLower = operatorForType.verboseName.toLowerCase();
        return {
            ...operator,
            ...operatorForType,
            moreVerboseName: MORE_VERBOSE_NAMES[verboseNameLower] || verboseNameLower,
            fields: operator.validArgumentsFilters.map(validArgumentsFilter => validArgumentsFilter(field, table))
        };
    });
}

// Breakouts and Aggregation options
function allFields(fields) {
    return fields;
}

function summableFields(fields) {
    return _.filter(fields, isSummable);
}

function dimensionFields(fields) {
    return _.filter(fields, isDimension);
}

var Aggregators = [{
    "name": "Dados não tratados",
    "short": "rows",
    "description": "Apenas uma tabela com as linhas da resposta, não há operações adicionais.",
    "advanced": false,
    "validFieldsFilters": []
}, {
    "name": "Contar",
    "short": "count",
    "description": "Número total de linhas na resposta.",
    "advanced": false,
    "validFieldsFilters": []
}, {
    "name": "Soma",
    "short": "sum",
    "description": "Soma de todos os valores de uma coluna.",
    "advanced": false,
    "validFieldsFilters": [summableFields]
}, {
    "name": "Média",
    "short": "avg",
    "description": "Média de todos os valores de uma coluna",
    "advanced": false,
    "validFieldsFilters": [summableFields]
}, {
    "name": "Número de valores distintos",
    "short": "distinct",
    "description":  "Número de valores exclusivos de uma coluna, em todas as linhas da resposta.",
    "advanced": true,
    "validFieldsFilters": [allFields]
}, {
    "name": "Soma acumulativa",
    "short": "cum_sum",
    "description": "Soma aditiva de todos os valores de uma coluna. \ne.x. receita total ao longo do tempo.",
    "advanced": true,
    "validFieldsFilters": [summableFields]
}, {
    "name": "Desvio padrão",
    "short": "stddev",
    "description": "Número que expressa o quanto os valores de uma coluna variam entre todas as linhas da resposta.",
    "advanced": true,
    "validFieldsFilters": [summableFields]
}];

var BreakoutAggregator = {
    "name": "Quebre por dimensão",
    "short": "breakout",
    "validFieldsFilters": [dimensionFields]
};

function populateFields(aggregator, fields) {
    return {
        'name': aggregator.name,
        'short': aggregator.short,
        'description': aggregator.description || '',
        'advanced': aggregator.advanced || false,
        'fields': _.map(aggregator.validFieldsFilters, function(validFieldsFilterFn) {
            return validFieldsFilterFn(fields);
        }),
        'validFieldsFilters': aggregator.validFieldsFilters
    };
}

function getAggregators(fields) {
    return _.map(Aggregators, function(aggregator) {
        return populateFields(aggregator, fields);
    });
}

function getBreakouts(fields) {
    var result = populateFields(BreakoutAggregator, fields);
    result.fields = result.fields[0];
    result.validFieldsFilter = result.validFieldsFilters[0];
    return result;
}

export function addValidOperatorsToFields(table) {
    for (let field of table.fields) {
        field.valid_operators = getOperators(field, table);
    }
    table.aggregation_options = getAggregators(table.fields);
    table.breakout_options = getBreakouts(table.fields);
    return table;
}

export function hasLatitudeAndLongitudeColumns(columnDefs) {
    let hasLatitude = false;
    let hasLongitude = false;
    for (let col of columnDefs) {
        if (col.special_type === "latitude") {
            hasLatitude = true;
        }
        if (col.special_type === "longitude") {
            hasLongitude = true;
        }
    }
    return hasLatitude && hasLongitude;
}
