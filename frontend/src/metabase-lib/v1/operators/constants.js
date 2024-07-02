import { t } from "ttag";
import _ from "underscore";

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
} from "metabase-lib/v1/types/constants";
import {
  isNumeric,
  isDate,
  isBoolean,
  isScope,
  isSummable,
  isLongitude,
} from "metabase-lib/v1/types/utils/isa";

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
export const FIELD_FILTER_OPERATORS = {
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
    multi: true,
    validArgumentsFilters: [freeformArgument],
    options: CASE_SENSITIVE_OPTION,
    optionsDefaults: { "case-sensitive": false },
  },
  "ends-with": {
    multi: true,
    validArgumentsFilters: [freeformArgument],
    options: CASE_SENSITIVE_OPTION,
    optionsDefaults: { "case-sensitive": false },
  },
  contains: {
    multi: true,
    validArgumentsFilters: [freeformArgument],
    options: CASE_SENSITIVE_OPTION,
    optionsDefaults: { "case-sensitive": false },
  },
  "does-not-contain": {
    multi: true,
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
export const FILTER_OPERATORS_BY_TYPE_ORDERED = {
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

export const MORE_VERBOSE_NAMES = {
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

export const AGGREGATION_OPERATORS = [
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
    short: "median",
    name: t`Median of ...`,
    columnName: t`Median`,
    description: t`Median of all the values of a column`,
    validFieldsFilters: [summableFields],
    requiresField: true,
    requiredDriverFeature: "percentile-aggregations",
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
