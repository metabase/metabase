import _ from "underscore";

// create a standardized set of strings to return
export const TIME = 'TIME';
export const NUMBER = 'NUMBER';
export const STRING = 'STRING';
export const BOOL = 'BOOL';
export const LOCATION = 'LOCATION';
export const UNKNOWN = 'UNKNOWN';

const DateBaseTypes = ['DateTimeField', 'DateField'];
const NumberBaseTypes = ['IntegerField', 'DecimalField', 'FloatField', 'BigIntegerField'];
const BooleanTypes = ["BooleanField"];

const SummableBaseTypes = ['IntegerField', 'DecimalField', 'FloatField', 'BigIntegerField'];
const CategoryBaseTypes = ["BooleanField"];

const DateSpecialTypes = ['timestamp_milliseconds', 'timestamp_seconds'];
const CategorySpecialTypes = ["category", "zip_code", "city", "state", "country"];

function isInTypes(type, typeCollection) {
    return _.contains(typeCollection, type);
}

export function isDate(field) {
    return isInTypes(field.base_type, DateBaseTypes) || isInTypes(field.special_type, DateSpecialTypes);
}

export function isNumeric(field) {
    return isInTypes(field.base_type, NumberBaseTypes);
}

export function isBoolean(field) {
    return isInTypes(field.base_type, BooleanTypes);
}

export function isSummable(field) {
    return isInTypes(field.base_type, SummableBaseTypes);
}

export function isCategory(field) {
    return isInTypes(field.base_type, CategoryBaseTypes) || isInTypes(field.special_type, CategorySpecialTypes);
}

export function isDimension(field) {
    return isDate(field) || isCategory(field) || isInTypes(field.field_type, ['dimension']);
}

// will return a string with possible values of 'date', 'number', 'bool', 'string'
// if the type cannot be parsed, then return undefined
export function getUmbrellaType(field) {
    return parseSpecialType(field.special_type) || parseBaseType(field.base_type);
}

export function parseBaseType(type) {
    switch(type) {
        case 'DateField':
        case 'DateTimeField':
        case 'TimeField':
            return TIME;
        case 'BigIntegerField':
        case 'IntegerField':
        case 'FloatField':
        case 'DecimalField':
            return NUMBER;
        case 'CharField':
        case 'TextField':
            return STRING;
        case 'BooleanField':
            return BOOL;
    }
}

export function parseSpecialType(type) {
    switch(type) {
        case 'timestamp_milliseconds':
        case 'timestamp_seconds':
            return TIME;
        case 'city':
        case 'country':
        case 'latitude':
        case 'longitude':
        case 'state':
        case 'zipcode':
            return LOCATION;
        case 'name':
            return STRING;
        case 'number':
            return NUMBER;
    }
}

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
                { key: true, name: "True" },
                { key: false, name: "False" }
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
        placeholders: ["Select longitude field", "Enter upper latitude", "Enter left longitude", "Enter lower latitude", "Enter right latitude"]
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
        { name: "=",       verboseName: "Equal" },
        { name: "!=",      verboseName: "Not equal" },
        { name: ">",       verboseName: "Greater than" },
        { name: "<",       verboseName: "Less than" },
        { name: "BETWEEN", verboseName: "Between" },
        { name: ">=",      verboseName: "Greater than or equal to", advanced: true },
        { name: "<=",      verboseName: "Less than or equal to", advanced: true },
        { name: "IS_NULL", verboseName: "Is empty", advanced: true },
        { name: "NOT_NULL",verboseName: "Not empty", advanced: true }
    ],
    [STRING]: [
        { name: "=",       verboseName: "Is" },
        { name: "!=",      verboseName: "Is not" },
        { name: "IS_NULL", verboseName: "Is empty", advanced: true },
        { name: "NOT_NULL",verboseName: "Not empty", advanced: true }
    ],
    [TIME]: [
        { name: "=",       verboseName: "Is" },
        { name: "<",       verboseName: "Before" },
        { name: ">",       verboseName: "After" },
        { name: "BETWEEN", verboseName: "Between" }
    ],
    [LOCATION]: [
        { name: "=",       verboseName: "Is" },
        { name: "!=",      verboseName: "Is not" },
        { name: "INSIDE",  verboseName: "Inside" }
    ],
    [BOOL]: [
        { name: "=",       verboseName: "Is", multi: false, defaults: [true] },
        { name: "IS_NULL", verboseName: "Is empty" },
        { name: "NOT_NULL",verboseName: "Not empty" }
    ],
    [UNKNOWN]: [
        { name: "=",       verboseName: "Is" },
        { name: "!=",      verboseName: "Is not" },
        { name: "IS_NULL", verboseName: "Is empty", advanced: true },
        { name: "NOT_NULL",verboseName: "Not empty", advanced: true }
    ]
};

const MORE_VERBOSE_NAMES = {
    "equal": "is equal to",
    "not equal": "is not equal to",
    "before": "is before",
    "after": "is afer",
    "not empty": "is not empty",
    "less than": "is less than",
    "greater than": "is greater than",
    "less than or equal to": "is less than or equal to",
    "greater than or equal to": "is greater than or equal to",
}

function getOperators(field, table) {
    let type = getUmbrellaType(field) || UNKNOWN;
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
    "name": "Raw data",
    "short": "rows",
    "description": "Just a table with the rows in the answer, no additional operations.",
    "advanced": false,
    "validFieldsFilters": []
}, {
    "name": "Count",
    "short": "count",
    "description": "Total number of rows in the answer.",
    "advanced": false,
    "validFieldsFilters": []
}, {
    "name": "Sum",
    "short": "sum",
    "description": "Sum of all the values of a column.",
    "advanced": false,
    "validFieldsFilters": [summableFields]
}, {
    "name": "Average",
    "short": "avg",
    "description": "Average of all the values of a column",
    "advanced": false,
    "validFieldsFilters": [summableFields]
}, {
    "name": "Number of distinct values",
    "short": "distinct",
    "description":  "Number of unique values of a column among all the rows in the answer.",
    "advanced": true,
    "validFieldsFilters": [allFields]
}, {
    "name": "Cumulative sum",
    "short": "cum_sum",
    "description": "Additive sum of all the values of a column.\ne.x. total revenue over time.",
    "advanced": true,
    "validFieldsFilters": [summableFields]
}, {
    "name": "Standard deviation",
    "short": "stddev",
    "description": "Number which expresses how much the values of a colum vary among all rows in the answer.",
    "advanced": true,
    "validFieldsFilters": [summableFields]
}];

var BreakoutAggregator = {
    "name": "Break out by dimension",
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
