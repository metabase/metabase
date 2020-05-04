/* @flow weak */

import _ from "underscore";
import { t } from "ttag";
import {
  isa,
  isFK as isTypeFK,
  isPK as isTypePK,
  TYPE,
} from "metabase/lib/types";

// primary field types used for picking operators, etc
export const NUMBER = "NUMBER";
export const STRING = "STRING";
export const STRING_LIKE = "STRING_LIKE";
export const BOOLEAN = "BOOLEAN";
export const TEMPORAL = "TEMPORAL";
export const LOCATION = "LOCATION";
export const COORDINATE = "COORDINATE";
export const FOREIGN_KEY = "FOREIGN_KEY";
export const PRIMARY_KEY = "PRIMARY_KEY";

// other types used for various purporses
export const ENTITY = "ENTITY";
export const SUMMABLE = "SUMMABLE";
export const CATEGORY = "CATEGORY";
export const DIMENSION = "DIMENSION";

export const UNKNOWN = "UNKNOWN";

// define various type hierarchies
// NOTE: be sure not to create cycles using the "other" types
const TYPES = {
  [TEMPORAL]: {
    base: [TYPE.Temporal],
    special: [TYPE.Temporal],
  },
  [NUMBER]: {
    base: [TYPE.Number],
    special: [TYPE.Number],
  },
  [STRING]: {
    base: [TYPE.Text],
    special: [TYPE.Text],
  },
  [STRING_LIKE]: {
    base: [TYPE.TextLike],
  },
  [BOOLEAN]: {
    base: [TYPE.Boolean],
  },
  [COORDINATE]: {
    special: [TYPE.Coordinate],
  },
  [LOCATION]: {
    special: [TYPE.Address],
  },
  [ENTITY]: {
    special: [TYPE.FK, TYPE.PK, TYPE.Name],
  },
  [FOREIGN_KEY]: {
    special: [TYPE.FK],
  },
  [PRIMARY_KEY]: {
    special: [TYPE.PK],
  },
  [SUMMABLE]: {
    include: [NUMBER],
    exclude: [ENTITY, LOCATION, TEMPORAL],
  },
  [CATEGORY]: {
    base: [TYPE.Boolean],
    special: [TYPE.Category],
    include: [LOCATION],
  },
  // NOTE: this is defunct right now.  see definition of isDimension below.
  [DIMENSION]: {
    include: [TEMPORAL, CATEGORY, ENTITY],
  },
};

export function isFieldType(type, field) {
  if (!field) {
    return false;
  }

  const typeDefinition = TYPES[type];
  // check to see if it belongs to any of the field types:
  for (const prop of ["base", "special"]) {
    const allowedTypes = typeDefinition[prop];
    if (!allowedTypes) {
      continue;
    }

    const fieldType = field[prop + "_type"];
    for (const allowedType of allowedTypes) {
      if (isa(fieldType, allowedType)) {
        return true;
      }
    }
  }

  // recursively check to see if it's NOT another field type:
  for (const excludedType of typeDefinition.exclude || []) {
    if (isFieldType(excludedType, field)) {
      return false;
    }
  }

  // recursively check to see if it's another field type:
  for (const includedType of typeDefinition.include || []) {
    if (isFieldType(includedType, field)) {
      return true;
    }
  }
  return false;
}

export function getFieldType(field) {
  // try more specific types first, then more generic types
  for (const type of [
    TEMPORAL,
    LOCATION,
    COORDINATE,
    FOREIGN_KEY,
    PRIMARY_KEY,
    NUMBER,
    STRING,
    STRING_LIKE,
    BOOLEAN,
  ]) {
    if (isFieldType(type, field)) {
      return type;
    }
  }
}

export const isDate = isFieldType.bind(null, TEMPORAL);
export const isNumeric = isFieldType.bind(null, NUMBER);
export const isBoolean = isFieldType.bind(null, BOOLEAN);
export const isString = isFieldType.bind(null, STRING);
export const isSummable = isFieldType.bind(null, SUMMABLE);
export const isCategory = isFieldType.bind(null, CATEGORY);
export const isLocation = isFieldType.bind(null, LOCATION);

export const isDimension = col =>
  col && col.source !== "aggregation" && !isDescription(col);
export const isMetric = col =>
  col && col.source !== "breakout" && isSummable(col);

export const isFK = field => field && isTypeFK(field.special_type);
export const isPK = field => field && isTypePK(field.special_type);
export const isEntityName = field =>
  field && isa(field.special_type, TYPE.Name);

export const isAny = col => true;

export const isNumericBaseType = field =>
  field && isa(field.base_type, TYPE.Number);

// ZipCode, ID, etc derive from Number but should not be formatted as numbers
export const isNumber = field =>
  field &&
  isNumericBaseType(field) &&
  (field.special_type == null || isa(field.special_type, TYPE.Number));

export const isBinnedNumber = field => isNumber(field) && !!field.binning_info;

export const isTime = field => field && isa(field.base_type, TYPE.Time);

export const isAddress = field =>
  field && isa(field.special_type, TYPE.Address);
export const isCity = field => field && isa(field.special_type, TYPE.City);
export const isState = field => field && isa(field.special_type, TYPE.State);
export const isZipCode = field =>
  field && isa(field.special_type, TYPE.ZipCode);
export const isCountry = field =>
  field && isa(field.special_type, TYPE.Country);
export const isCoordinate = field =>
  field && isa(field.special_type, TYPE.Coordinate);
export const isLatitude = field =>
  field && isa(field.special_type, TYPE.Latitude);
export const isLongitude = field =>
  field && isa(field.special_type, TYPE.Longitude);

export const isCurrency = field =>
  field && isa(field.special_type, TYPE.Currency);

export const isDescription = field =>
  field && isa(field.special_type, TYPE.Description);

export const isID = field => isFK(field) || isPK(field);

export const isURL = field => field && isa(field.special_type, TYPE.URL);
export const isEmail = field => field && isa(field.special_type, TYPE.Email);
export const isAvatarURL = field =>
  field && isa(field.special_type, TYPE.AvatarURL);
export const isImageURL = field =>
  field && isa(field.special_type, TYPE.ImageURL);

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
      values: [{ key: true, name: t`True` }, { key: false, name: t`False` }],
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
    .filter(field => isa(field.special_type, TYPE.Longitude))
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
      { column: { special_type: TYPE.Latitude }, compact: true },
      { column: { special_type: TYPE.Longitude }, compact: true },
      { column: { special_type: TYPE.Latitude }, compact: true },
      { column: { special_type: TYPE.Longitude }, compact: true },
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
    { name: "is-null", verboseName: t`Is empty` },
    { name: "not-null", verboseName: t`Not empty` },
    { name: "starts-with", verboseName: t`Starts with` },
    { name: "ends-with", verboseName: t`Ends with` },
  ],
  [STRING_LIKE]: [
    { name: "=", verboseName: t`Is` },
    { name: "!=", verboseName: t`Is not` },
    { name: "is-null", verboseName: t`Is empty` },
    { name: "not-null", verboseName: t`Not empty` },
  ],
  [TEMPORAL]: [
    { name: "=", verboseName: t`Is` },
    { name: "<", verboseName: t`Before` },
    { name: ">", verboseName: t`After` },
    { name: "between", verboseName: t`Between` },
    { name: "is-null", verboseName: t`Is empty` },
    { name: "not-null", verboseName: t`Not empty` },
  ],
  [LOCATION]: [
    { name: "=", verboseName: t`Is` },
    { name: "!=", verboseName: t`Is not` },
    { name: "is-null", verboseName: t`Is empty` },
    { name: "not-null", verboseName: t`Not empty` },
  ],
  [COORDINATE]: [
    { name: "=", verboseName: t`Is` },
    { name: "!=", verboseName: t`Is not` },
    { name: "inside", verboseName: t`Inside` },
  ],
  [BOOLEAN]: [
    { name: "=", verboseName: t`Is`, multi: false },
    { name: "is-null", verboseName: t`Is empty` },
    { name: "not-null", verboseName: t`Not empty` },
  ],
  [FOREIGN_KEY]: DEFAULT_FILTER_OPERATORS,
  [PRIMARY_KEY]: DEFAULT_FILTER_OPERATORS,
  [UNKNOWN]: DEFAULT_FILTER_OPERATORS,
};

const MORE_VERBOSE_NAMES = {
  "equal to": "is equal to",
  "not equal to": "is not equal to",
  before: "is before",
  after: "is after",
  "not empty": "is not empty",
  "less than": "is less than",
  "greater than": "is greater than",
  "less than or equal to": "is less than or equal to",
  "greater than or equal to": "is greater than or equal to",
};

export function getFilterOperators(field, table) {
  const type = getFieldType(field) || UNKNOWN;
  return FILTER_OPERATORS_BY_TYPE_ORDERED[type].map(operatorForType => {
    const operator = FIELD_FILTER_OPERATORS[operatorForType.name];
    const verboseNameLower = operatorForType.verboseName.toLowerCase();
    return {
      ...operator,
      ...operatorForType,
      moreVerboseName: MORE_VERBOSE_NAMES[verboseNameLower] || verboseNameLower,
      fields: operator.validArgumentsFilters.map(validArgumentsFilter =>
        validArgumentsFilter(field, table),
      ),
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
    validFieldsFilters: [summableFields],
    requiresField: true,
    requiredDriverFeature: "basic-aggregations",
  },
  {
    short: "max",
    name: t`Maximum of ...`,
    columnName: t`Max`,
    description: t`Maximum value of a column`,
    validFieldsFilters: [summableFields],
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

// TODO: unit test
export function getAggregationOperators(table) {
  return AGGREGATION_OPERATORS.filter(
    aggregationOperator =>
      !(
        aggregationOperator.requiredDriverFeature &&
        table.db &&
        !_.contains(
          table.db.features,
          aggregationOperator.requiredDriverFeature,
        )
      ),
  ).map(aggregationOperator =>
    populateFields(aggregationOperator, table.fields),
  );
}

export function getAggregationOperatorsWithFields(table) {
  return getAggregationOperators(table).filter(
    aggregation =>
      !aggregation.requiresField ||
      aggregation.fields.every(fields => fields.length > 0),
  );
}

// TODO: unit test
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
  table.aggregation_operators = getAggregationOperatorsWithFields(table);
  return table;
}

export function hasLatitudeAndLongitudeColumns(cols) {
  let hasLatitude = false;
  let hasLongitude = false;
  for (const col of cols) {
    if (isLatitude(col)) {
      hasLatitude = true;
    }
    if (isLongitude(col)) {
      hasLongitude = true;
    }
  }
  return hasLatitude && hasLongitude;
}

export function foreignKeyCountsByOriginTable(fks) {
  if (fks === null || !Array.isArray(fks)) {
    return null;
  }

  return fks
    .map(function(fk) {
      return "origin" in fk ? fk.origin.table.id : null;
    })
    .reduce(function(prev, curr, idx, array) {
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
};

export function getIconForField(field) {
  return ICON_MAPPING[getFieldType(field)] || "unknown";
}

export function getFilterArgumentFormatOptions(filterOperator, index) {
  return (
    (filterOperator &&
      filterOperator.formatOptions &&
      filterOperator.formatOptions[index]) ||
    {}
  );
}
