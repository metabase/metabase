import { t } from "ttag";
import _ from "underscore";

import {
  BOOLEAN,
  COORDINATE,
  FOREIGN_KEY,
  LOCATION,
  NUMBER,
  PRIMARY_KEY,
  STRING,
  STRING_LIKE,
  TEMPORAL,
  TYPE,
  UNKNOWN,
} from "metabase-lib/v1/types/constants";
import {
  isBoolean,
  isDate,
  isLongitude,
  isNumeric,
  isScope,
  isSummable,
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
    .filter((field) => isLongitude(field))
    .map((field) => ({
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
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      t`Select longitude field`,
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      t`Enter upper latitude`,
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      t`Enter left longitude`,
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      t`Enter lower latitude`,
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
  {
    name: "=",
    get verboseName() {
      return t`Is`;
    },
  },
  {
    name: "!=",
    get verboseName() {
      return t`Is not`;
    },
  },
  {
    name: "is-null",
    get verboseName() {
      return t`Is empty`;
    },
  },
  {
    name: "not-null",
    get verboseName() {
      return t`Not empty`;
    },
  },
];

const KEY_FILTER_OPERATORS = [
  {
    name: "=",
    get verboseName() {
      return t`Is`;
    },
  },
  {
    name: "!=",
    get verboseName() {
      return t`Is not`;
    },
  },
  {
    name: ">",
    get verboseName() {
      return t`Greater than`;
    },
  },
  {
    name: "<",
    get verboseName() {
      return t`Less than`;
    },
  },
  {
    name: "between",
    get verboseName() {
      return t`Between`;
    },
  },
  {
    name: ">=",
    get verboseName() {
      return t`Greater than or equal to`;
    },
  },
  {
    name: "<=",
    get verboseName() {
      return t`Less than or equal to`;
    },
  },
  {
    name: "is-null",
    get verboseName() {
      return t`Is empty`;
    },
  },
  {
    name: "not-null",
    get verboseName() {
      return t`Not empty`;
    },
  },
];

// ordered list of operators and metadata per type
export const FILTER_OPERATORS_BY_TYPE_ORDERED = {
  [NUMBER]: [
    {
      name: "=",
      get verboseName() {
        return t`Equal to`;
      },
    },
    {
      name: "!=",
      get verboseName() {
        return t`Not equal to`;
      },
    },
    {
      name: ">",
      get verboseName() {
        return t`Greater than`;
      },
    },
    {
      name: "<",
      get verboseName() {
        return t`Less than`;
      },
    },
    {
      name: "between",
      get verboseName() {
        return t`Between`;
      },
    },
    {
      name: ">=",
      get verboseName() {
        return t`Greater than or equal to`;
      },
    },
    {
      name: "<=",
      get verboseName() {
        return t`Less than or equal to`;
      },
    },
    {
      name: "is-null",
      get verboseName() {
        return t`Is empty`;
      },
    },
    {
      name: "not-null",
      get verboseName() {
        return t`Not empty`;
      },
    },
  ],
  [STRING]: [
    {
      name: "=",
      get verboseName() {
        return t`Is`;
      },
    },
    {
      name: "!=",
      get verboseName() {
        return t`Is not`;
      },
    },
    {
      name: "contains",
      get verboseName() {
        return t`Contains`;
      },
    },
    {
      name: "does-not-contain",
      get verboseName() {
        return t`Does not contain`;
      },
    },
    {
      name: "is-null",
      get verboseName() {
        return t`Is null`;
      },
    },
    {
      name: "not-null",
      get verboseName() {
        return t`Not null`;
      },
    },
    {
      name: "is-empty",
      get verboseName() {
        return t`Is empty`;
      },
    },
    {
      name: "not-empty",
      get verboseName() {
        return t`Not empty`;
      },
    },
    {
      name: "starts-with",
      get verboseName() {
        return t`Starts with`;
      },
    },
    {
      name: "ends-with",
      get verboseName() {
        return t`Ends with`;
      },
    },
  ],
  [STRING_LIKE]: [
    {
      name: "=",
      get verboseName() {
        return t`Is`;
      },
    },
    {
      name: "!=",
      get verboseName() {
        return t`Is not`;
      },
    },
    {
      name: "is-null",
      get verboseName() {
        return t`Is null`;
      },
    },
    {
      name: "not-null",
      get verboseName() {
        return t`Not null`;
      },
    },
    {
      name: "is-empty",
      get verboseName() {
        return t`Is empty`;
      },
    },
    {
      name: "not-empty",
      get verboseName() {
        return t`Not empty`;
      },
    },
  ],
  [TEMPORAL]: [
    {
      name: "!=",
      get verboseName() {
        return t`Excludes`;
      },
    },
    {
      name: "=",
      get verboseName() {
        return t`Is`;
      },
    },
    {
      name: "<",
      get verboseName() {
        return t`Before`;
      },
    },
    {
      name: ">",
      get verboseName() {
        return t`After`;
      },
    },
    {
      name: "between",
      get verboseName() {
        return t`Between`;
      },
    },
    {
      name: "is-null",
      get verboseName() {
        return t`Is empty`;
      },
    },
    {
      name: "not-null",
      get verboseName() {
        return t`Is not empty`;
      },
    },
  ],
  [LOCATION]: [
    {
      name: "=",
      get verboseName() {
        return t`Is`;
      },
    },
    {
      name: "!=",
      get verboseName() {
        return t`Is not`;
      },
    },
    {
      name: "is-null",
      get verboseName() {
        return t`Is empty`;
      },
    },
    {
      name: "not-null",
      get verboseName() {
        return t`Not empty`;
      },
    },
    {
      name: "contains",
      get verboseName() {
        return t`Contains`;
      },
    },
    {
      name: "does-not-contain",
      get verboseName() {
        return t`Does not contain`;
      },
    },
    {
      name: "starts-with",
      get verboseName() {
        return t`Starts with`;
      },
    },
    {
      name: "ends-with",
      get verboseName() {
        return t`Ends with`;
      },
    },
  ],
  [COORDINATE]: [
    {
      name: "=",
      get verboseName() {
        return t`Is`;
      },
    },
    {
      name: "!=",
      get verboseName() {
        return t`Is not`;
      },
    },
    {
      name: "inside",
      get verboseName() {
        return t`Inside`;
      },
    },
    {
      name: ">",
      get verboseName() {
        return t`Greater than`;
      },
    },
    {
      name: "<",
      get verboseName() {
        return t`Less than`;
      },
    },
    {
      name: "between",
      get verboseName() {
        return t`Between`;
      },
    },
    {
      name: ">=",
      get verboseName() {
        return t`Greater than or equal to`;
      },
    },
    {
      name: "<=",
      get verboseName() {
        return t`Less than or equal to`;
      },
    },
  ],
  [BOOLEAN]: [
    {
      name: "=",
      get verboseName() {
        return t`Is`;
      },
      multi: false,
    },
    {
      name: "is-null",
      get verboseName() {
        return t`Is empty`;
      },
    },
    {
      name: "not-null",
      get verboseName() {
        return t`Not empty`;
      },
    },
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
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    name: t`Raw data`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    description: t`Just a table with the rows in the answer, no additional operations.`,
    validFieldsFilters: [],
    requiresField: false,
    requiredDriverFeature: "basic-aggregations",
  },
  {
    short: "count",
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    name: t`Count of rows`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    columnName: t`Count`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    description: t`Total number of rows in the answer.`,
    validFieldsFilters: [],
    requiresField: false,
    requiredDriverFeature: "basic-aggregations",
  },
  {
    short: "sum",
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    name: t`Sum of ...`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    columnName: t`Sum`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    description: t`Sum of all the values of a column.`,
    validFieldsFilters: [summableFields],
    requiresField: true,
    requiredDriverFeature: "basic-aggregations",
  },
  {
    short: "avg",
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    name: t`Average of ...`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    columnName: t`Average`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    description: t`Average of all the values of a column`,
    validFieldsFilters: [summableFields],
    requiresField: true,
    requiredDriverFeature: "basic-aggregations",
  },
  {
    short: "median",
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    name: t`Median of ...`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    columnName: t`Median`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    description: t`Median of all the values of a column`,
    validFieldsFilters: [summableFields],
    requiresField: true,
    requiredDriverFeature: "percentile-aggregations",
  },
  {
    short: "distinct",
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    name: t`Number of distinct values of ...`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    columnName: t`Distinct values`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    description: t`Number of unique values of a column among all the rows in the answer.`,
    validFieldsFilters: [allFields],
    requiresField: true,
    requiredDriverFeature: "basic-aggregations",
  },
  {
    short: "cum-sum",
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    name: t`Cumulative sum of ...`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    columnName: t`Cumulative sum`, // NOTE: actually "Sum" as of 2019-10-01
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    description: t`Additive sum of all the values of a column.\ne.x. total revenue over time.`,
    validFieldsFilters: [summableFields],
    requiresField: true,
    requiredDriverFeature: "basic-aggregations",
  },
  {
    short: "cum-count",
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    name: t`Cumulative count of rows`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    columnName: t`Cumulative count`, // NOTE: actually "Count" as of 2019-10-01
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    description: t`Additive count of the number of rows.\ne.x. total number of sales over time.`,
    validFieldsFilters: [],
    requiresField: false,
    requiredDriverFeature: "basic-aggregations",
  },
  {
    short: "stddev",
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    name: t`Standard deviation of ...`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    columnName: t`Standard deviation`, // NOTE: actually "SD" as of 2019-10-01
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    description: t`Number which expresses how much the values of a column vary among all rows in the answer.`,
    validFieldsFilters: [summableFields],
    requiresField: true,
    requiredDriverFeature: "standard-deviation-aggregations",
  },
  {
    short: "min",
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    name: t`Minimum of ...`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    columnName: t`Min`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    description: t`Minimum value of a column`,
    validFieldsFilters: [scopeFields],
    requiresField: true,
    requiredDriverFeature: "basic-aggregations",
  },
  {
    short: "max",
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    name: t`Maximum of ...`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    columnName: t`Max`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    description: t`Maximum value of a column`,
    validFieldsFilters: [scopeFields],
    requiresField: true,
    requiredDriverFeature: "basic-aggregations",
  },
];
