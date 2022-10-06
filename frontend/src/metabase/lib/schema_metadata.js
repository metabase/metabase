import _ from "underscore";
import { t } from "ttag";
import { field_semantic_types_map } from "metabase/lib/core";
import {
  isNumeric,
  isDate,
  isBoolean,
  isScope,
  isSummable,
  getFieldType,
  isFieldType,
  isLongitude,
} from "metabase-lib/lib/types/utils/isa";
import {
  TYPE,
  TEMPORAL,
  LOCATION,
  COORDINATE,
  FOREIGN_KEY,
  PRIMARY_KEY,
  STRING,
  STRING_LIKE,
  NUMBER,
  BOOLEAN,
  UNKNOWN,
} from "metabase-lib/lib/types/constants";

// filter operator argument constructors:

function freeformArgument(field, table) {
  return {
    type: "text",
  };
}

function numberArgument(field, table) {
  return {
    type: "number",
  };
}

function comparableArgument(field, table) {
  if (isDate(field)) {
    return {
      type: "date",
    };
  }

  if (isNumeric(field)) {
    return {
      type: "number",
    };
  }

  return {
    type: "text",
  };
}

function equivalentArgument(field, table) {
  if (isBoolean(field)) {
    return {
      type: "select",
      values: [
        { key: true, name: t`True` },
        { key: false, name: t`False` },
      ],
      default: true,
    };
  }

  if (isDate(field)) {
    return {
      type: "date",
    };
  }

  if (isNumeric(field)) {
    return {
      type: "number",
    };
  }

  return {
    type: "text",
  };
}

function longitudeFieldSelectArgument(field, table) {
  const values = table.fields
    .filter(field => isLongitude(field))
    .map(field => ({
      key: field.id,
      name: field.display_name,
    }));
  if (values.length === 1) {
    return {
      type: "hidden",
      default: values[0].key,
    };
  } else {
    return {
      type: "select",
      values: values,
    };
  }
}

const CASE_SENSITIVE_OPTION = {
  "case-sensitive": {
    defaultValue: true,
  },
};

// each of these has an implicit field argument, followed by 0 or more additional arguments
const FIELD_FILTER_OPERATORS = {
  "=": {
    validArgumentsFilters: [equivalentArgument],
    multi: true,
  },
  "!=": {
    validArgumentsFilters: [equivalentArgument],
    multi: true,
  },
  "is-empty": {
    validArgumentsFilters: [],
  },
  "not-empty": {
    validArgumentsFilters: [],
  },
  "is-null": {
    validArgumentsFilters: [],
  },
  "not-null": {
    validArgumentsFilters: [],
  },
  "<": {
    validArgumentsFilters: [comparableArgument],
  },
  "<=": {
    validArgumentsFilters: [comparableArgument],
  },
  ">": {
    validArgumentsFilters: [comparableArgument],
  },
  ">=": {
    validArgumentsFilters: [comparableArgument],
  },
  inside: {
    validArgumentsFilters: [
      longitudeFieldSelectArgument,
      numberArgument,
      numberArgument,
      numberArgument,
      numberArgument,
    ],
    placeholders: [
      t`Select longitude field`,
      t`Enter upper latitude`,
      t`Enter left longitude`,
      t`Enter lower latitude`,
      t`Enter right longitude`,
    ],
    formatOptions: [
      { hide: true },
      { column: { semantic_type: TYPE.Latitude }, compact: true },
      { column: { semantic_type: TYPE.Longitude }, compact: true },
      { column: { semantic_type: TYPE.Latitude }, compact: true },
      { column: { semantic_type: TYPE.Longitude }, compact: true },
    ],
  },
  between: {
    validArgumentsFilters: [comparableArgument, comparableArgument],
  },
  "starts-with": {
    validArgumentsFilters: [freeformArgument],
    options: CASE_SENSITIVE_OPTION,
    optionsDefaults: { "case-sensitive": false },
  },
  "ends-with": {
    validArgumentsFilters: [freeformArgument],
    options: CASE_SENSITIVE_OPTION,
    optionsDefaults: { "case-sensitive": false },
  },
  contains: {
    validArgumentsFilters: [freeformArgument],
    options: CASE_SENSITIVE_OPTION,
    optionsDefaults: { "case-sensitive": false },
  },
  "does-not-contain": {
    validArgumentsFilters: [freeformArgument],
    options: CASE_SENSITIVE_OPTION,
    optionsDefaults: { "case-sensitive": false },
  },
};

const DEFAULT_FILTER_OPERATORS = [
  { name: "=", verboseName: t`Is` },
  { name: "!=", verboseName: t`Is not` },
  { name: "is-null", verboseName: t`Is empty` },
  { name: "not-null", verboseName: t`Not empty` },
];

const KEY_FILTER_OPERATORS = [
  { name: "=", verboseName: t`Is` },
  { name: "!=", verboseName: t`Is not` },
  { name: ">", verboseName: t`Greater than` },
  { name: "<", verboseName: t`Less than` },
  { name: "between", verboseName: t`Between` },
  { name: ">=", verboseName: t`Greater than or equal to` },
  { name: "<=", verboseName: t`Less than or equal to` },
  { name: "is-null", verboseName: t`Is empty` },
  { name: "not-null", verboseName: t`Not empty` },
];

// ordered list of operators and metadata per type
const FILTER_OPERATORS_BY_TYPE_ORDERED = {
  [NUMBER]: [
    { name: "=", verboseName: t`Equal to` },
    { name: "!=", verboseName: t`Not equal to` },
    { name: ">", verboseName: t`Greater than` },
    { name: "<", verboseName: t`Less than` },
    { name: "between", verboseName: t`Between` },
    { name: ">=", verboseName: t`Greater than or equal to` },
    { name: "<=", verboseName: t`Less than or equal to` },
    { name: "is-null", verboseName: t`Is empty` },
    { name: "not-null", verboseName: t`Not empty` },
  ],
  [STRING]: [
    { name: "=", verboseName: t`Is` },
    { name: "!=", verboseName: t`Is not` },
    { name: "contains", verboseName: t`Contains` },
    { name: "does-not-contain", verboseName: t`Does not contain` },
    { name: "is-null", verboseName: t`Is null` },
    { name: "not-null", verboseName: t`Not null` },
    { name: "is-empty", verboseName: t`Is empty` },
    { name: "not-empty", verboseName: t`Not empty` },
    { name: "starts-with", verboseName: t`Starts with` },
    { name: "ends-with", verboseName: t`Ends with` },
  ],
  [STRING_LIKE]: [
    { name: "=", verboseName: t`Is` },
    { name: "!=", verboseName: t`Is not` },
    { name: "is-null", verboseName: t`Is null` },
    { name: "not-null", verboseName: t`Not null` },
    { name: "is-empty", verboseName: t`Is empty` },
    { name: "not-empty", verboseName: t`Not empty` },
  ],
  [TEMPORAL]: [
    { name: "!=", verboseName: t`Excludes` },
    { name: "=", verboseName: t`Is` },
    { name: "<", verboseName: t`Before` },
    { name: ">", verboseName: t`After` },
    { name: "between", verboseName: t`Between` },
    { name: "is-null", verboseName: t`Is empty` },
    { name: "not-null", verboseName: t`Is not empty` },
  ],
  [LOCATION]: [
    { name: "=", verboseName: t`Is` },
    { name: "!=", verboseName: t`Is not` },
    { name: "is-null", verboseName: t`Is empty` },
    { name: "not-null", verboseName: t`Not empty` },
    { name: "contains", verboseName: t`Contains` },
    { name: "does-not-contain", verboseName: t`Does not contain` },
    { name: "starts-with", verboseName: t`Starts with` },
    { name: "ends-with", verboseName: t`Ends with` },
  ],
  [COORDINATE]: [
    { name: "=", verboseName: t`Is` },
    { name: "!=", verboseName: t`Is not` },
    { name: "inside", verboseName: t`Inside` },
    { name: ">", verboseName: t`Greater than` },
    { name: "<", verboseName: t`Less than` },
    { name: "between", verboseName: t`Between` },
    { name: ">=", verboseName: t`Greater than or equal to` },
    { name: "<=", verboseName: t`Less than or equal to` },
  ],
  [BOOLEAN]: [
    { name: "=", verboseName: t`Is`, multi: false },
    { name: "is-null", verboseName: t`Is empty` },
    { name: "not-null", verboseName: t`Not empty` },
  ],
  [FOREIGN_KEY]: KEY_FILTER_OPERATORS,
  [PRIMARY_KEY]: KEY_FILTER_OPERATORS,
  [UNKNOWN]: DEFAULT_FILTER_OPERATORS,
};

const MORE_VERBOSE_NAMES = {
  "equal to": "is equal to",
  "not equal to": "is not equal to",
  before: "is before",
  after: "is after",
  "not empty": "is not empty",
  "not null": "is not null",
  "less than": "is less than",
  "greater than": "is greater than",
  "less than or equal to": "is less than or equal to",
  "greater than or equal to": "is greater than or equal to",
};

export function doesOperatorExist(operatorName) {
  return !!FIELD_FILTER_OPERATORS[operatorName];
}

export function getOperatorByTypeAndName(type, name) {
  const typedNamedOperator = _.findWhere(
    FILTER_OPERATORS_BY_TYPE_ORDERED[type],
    {
      name,
    },
  );
  const namedOperator = FIELD_FILTER_OPERATORS[name];

  return (
    typedNamedOperator && {
      ...typedNamedOperator,
      ...namedOperator,
      numFields: namedOperator.validArgumentsFilters.length,
    }
  );
}

export function getFilterOperators(field, table, selected) {
  const fieldType = getFieldType(field) || UNKNOWN;
  let type = fieldType;
  if (type === PRIMARY_KEY || type === FOREIGN_KEY) {
    if (isFieldType(STRING, field)) {
      type = STRING;
    } else if (isFieldType(STRING_LIKE, field)) {
      type = STRING_LIKE;
    }
  }

  return FILTER_OPERATORS_BY_TYPE_ORDERED[type]
    .map(operatorForType => {
      const operator = FIELD_FILTER_OPERATORS[operatorForType.name];
      const verboseNameLower = operatorForType.verboseName.toLowerCase();
      return {
        ...operator,
        ...operatorForType,
        moreVerboseName:
          MORE_VERBOSE_NAMES[verboseNameLower] || verboseNameLower,
        fields: operator.validArgumentsFilters.map(validArgumentsFilter =>
          validArgumentsFilter(field, table),
        ),
      };
    })
    .filter(operator => {
      if (selected === undefined) {
        return true;
      }
      if (type === "STRING" || type === "STRING_LIKE") {
        // Text fields should only have is-null / not-null if it was already selected
        if (selected === "is-null") {
          return operator["name"] !== "not-null";
        } else if (selected === "not-null") {
          return operator["name"] !== "is-null";
        } else {
          return (
            operator["name"] !== "not-null" && operator["name"] !== "is-null"
          );
        }
      }
      return true;
    });
}

// Breakouts and Aggregation options
function allFields(fields) {
  return fields;
}

function summableFields(fields) {
  return _.filter(fields, isSummable);
}

function scopeFields(fields) {
  return _.filter(fields, isScope);
}

const AGGREGATION_OPERATORS = [
  {
    // DEPRECATED: "rows" is equivalent to no aggregations
    short: "rows",
    name: t`Raw data`,
    description: t`Just a table with the rows in the answer, no additional operations.`,
    validFieldsFilters: [],
    requiresField: false,
    requiredDriverFeature: "basic-aggregations",
  },
  {
    short: "count",
    name: t`Count of rows`,
    columnName: t`Count`,
    description: t`Total number of rows in the answer.`,
    validFieldsFilters: [],
    requiresField: false,
    requiredDriverFeature: "basic-aggregations",
  },
  {
    short: "sum",
    name: t`Sum of ...`,
    columnName: t`Sum`,
    description: t`Sum of all the values of a column.`,
    validFieldsFilters: [summableFields],
    requiresField: true,
    requiredDriverFeature: "basic-aggregations",
  },
  {
    short: "avg",
    name: t`Average of ...`,
    columnName: t`Average`,
    description: t`Average of all the values of a column`,
    validFieldsFilters: [summableFields],
    requiresField: true,
    requiredDriverFeature: "basic-aggregations",
  },
  {
    short: "distinct",
    name: t`Number of distinct values of ...`,
    columnName: t`Distinct values`,
    description: t`Number of unique values of a column among all the rows in the answer.`,
    validFieldsFilters: [allFields],
    requiresField: true,
    requiredDriverFeature: "basic-aggregations",
  },
  {
    short: "cum-sum",
    name: t`Cumulative sum of ...`,
    columnName: t`Cumulative sum`, // NOTE: actually "Sum" as of 2019-10-01
    description: t`Additive sum of all the values of a column.\ne.x. total revenue over time.`,
    validFieldsFilters: [summableFields],
    requiresField: true,
    requiredDriverFeature: "basic-aggregations",
  },
  {
    short: "cum-count",
    name: t`Cumulative count of rows`,
    columnName: t`Cumulative count`, // NOTE: actually "Count" as of 2019-10-01
    description: t`Additive count of the number of rows.\ne.x. total number of sales over time.`,
    validFieldsFilters: [],
    requiresField: false,
    requiredDriverFeature: "basic-aggregations",
  },
  {
    short: "stddev",
    name: t`Standard deviation of ...`,
    columnName: t`Standard deviation`, // NOTE: actually "SD" as of 2019-10-01
    description: t`Number which expresses how much the values of a column vary among all rows in the answer.`,
    validFieldsFilters: [summableFields],
    requiresField: true,
    requiredDriverFeature: "standard-deviation-aggregations",
  },
  {
    short: "min",
    name: t`Minimum of ...`,
    columnName: t`Min`,
    description: t`Minimum value of a column`,
    validFieldsFilters: [scopeFields],
    requiresField: true,
    requiredDriverFeature: "basic-aggregations",
  },
  {
    short: "max",
    name: t`Maximum of ...`,
    columnName: t`Max`,
    description: t`Maximum value of a column`,
    validFieldsFilters: [scopeFields],
    requiresField: true,
    requiredDriverFeature: "basic-aggregations",
  },
];

function populateFields(aggregationOperator, fields) {
  return {
    ...aggregationOperator,
    fields: aggregationOperator.validFieldsFilters.map(validFieldsFilters =>
      validFieldsFilters(fields),
    ),
  };
}

export function getSupportedAggregationOperators(table) {
  return AGGREGATION_OPERATORS.filter(operator => {
    if (!operator.requiredDriverFeature) {
      return true;
    }
    return (
      table.db && table.db.features.includes(operator.requiredDriverFeature)
    );
  });
}

export function getAggregationOperators(table) {
  return getSupportedAggregationOperators(table)
    .map(operator => populateFields(operator, table.fields))
    .filter(
      aggregation =>
        !aggregation.requiresField ||
        aggregation.fields.every(fields => fields.length > 0),
    );
}

export function getAggregationOperator(short) {
  return _.findWhere(AGGREGATION_OPERATORS, { short: short });
}

export function isCompatibleAggregationOperatorForField(
  aggregationOperator,
  field,
) {
  return aggregationOperator.validFieldsFilters.every(
    filter => filter([field]).length === 1,
  );
}

export function addValidOperatorsToFields(table) {
  for (const field of table.fields) {
    field.filter_operators = getFilterOperators(field, table);
  }
  table.aggregation_operators = getAggregationOperators(table);
  return table;
}

export function foreignKeyCountsByOriginTable(fks) {
  if (fks === null || !Array.isArray(fks)) {
    return null;
  }

  return fks
    .map(function (fk) {
      return "origin" in fk ? fk.origin.table.id : null;
    })
    .reduce(function (prev, curr, idx, array) {
      if (curr in prev) {
        prev[curr]++;
      } else {
        prev[curr] = 1;
      }

      return prev;
    }, {});
}

export const ICON_MAPPING = {
  [TEMPORAL]: "calendar",
  [LOCATION]: "location",
  [COORDINATE]: "location",
  [STRING]: "string",
  [STRING_LIKE]: "string",
  [NUMBER]: "int",
  [BOOLEAN]: "io",
  [FOREIGN_KEY]: "connections",
  [PRIMARY_KEY]: "label",
};

export function getIconForField(field) {
  return ICON_MAPPING[getFieldType(field)] || "unknown";
}

export function getSemanticTypeIcon(semanticType, fallback) {
  const semanticTypeMetadata = field_semantic_types_map[semanticType];
  return semanticTypeMetadata?.icon ?? fallback;
}

export function getSemanticTypeName(semanticType) {
  const semanticTypeMetadata = field_semantic_types_map[semanticType];
  return semanticTypeMetadata?.name;
}

export function getFilterArgumentFormatOptions(filterOperator, index) {
  return (
    (filterOperator &&
      filterOperator.formatOptions &&
      filterOperator.formatOptions[index]) ||
    {}
  );
}

export function isEqualsOperator(operator) {
  return !!operator && operator.name === "=";
}

export function isFuzzyOperator(operator) {
  const { name } = operator || {};
  return !["=", "!="].includes(name);
}
