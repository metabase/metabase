import _ from "underscore";
import { t } from "c-3po";
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
export const DATE_TIME = "DATE_TIME";
export const LOCATION = "LOCATION";
export const COORDINATE = "COORDINATE";
export const FOREIGN_KEY = "FOREIGN_KEY";

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
    base: [TYPE.DateTime],
    special: [TYPE.DateTime],
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
  [SUMMABLE]: {
    include: [NUMBER],
    exclude: [ENTITY, LOCATION, DATE_TIME],
  },
  [CATEGORY]: {
    base: [TYPE.Boolean],
    special: [TYPE.Category],
    include: [LOCATION],
  },
  // NOTE: this is defunct right now.  see definition of isDimension below.
  [DIMENSION]: {
    include: [DATE_TIME, CATEGORY, ENTITY],
  },
};

export function isFieldType(type, field) {
  if (!field) return false;

  const typeDefinition = TYPES[type];
  // check to see if it belongs to any of the field types:
  for (const prop of ["base", "special"]) {
    const allowedTypes = typeDefinition[prop];
    if (!allowedTypes) continue;

    const fieldType = field[prop + "_type"];
    for (const allowedType of allowedTypes) {
      if (isa(fieldType, allowedType)) return true;
    }
  }

  // recursively check to see if it's NOT another field type:
  for (const excludedType of typeDefinition.exclude || []) {
    if (isFieldType(excludedType, field)) return false;
  }

  // recursively check to see if it's another field type:
  for (const includedType of typeDefinition.include || []) {
    if (isFieldType(includedType, field)) return true;
  }
  return false;
}

export function getFieldType(field) {
  // try more specific types first, then more generic types
  for (const type of [
    DATE_TIME,
    LOCATION,
    COORDINATE,
    FOREIGN_KEY,
    NUMBER,
    STRING,
    STRING_LIKE,
    BOOLEAN,
  ]) {
    if (isFieldType(type, field)) return type;
  }
}

export const isDate = isFieldType.bind(null, DATE_TIME);
export const isNumeric = isFieldType.bind(null, NUMBER);
export const isBoolean = isFieldType.bind(null, BOOLEAN);
export const isString = isFieldType.bind(null, STRING);
export const isSummable = isFieldType.bind(null, SUMMABLE);
export const isCategory = isFieldType.bind(null, CATEGORY);

export const isDimension = col => col && col.source !== "aggregation";
export const isMetric = col =>
  col && col.source !== "breakout" && isSummable(col);

export const isFK = field => field && isTypeFK(field.special_type);
export const isPK = field => field && isTypePK(field.special_type);
export const isEntityName = field =>
  isa(field && field.special_type, TYPE.Name);

export const isAny = col => true;

export const isNumericBaseType = field =>
  isa(field && field.base_type, TYPE.Number);

// ZipCode, ID, etc derive from Number but should not be formatted as numbers
export const isNumber = field =>
  field &&
  isNumericBaseType(field) &&
  (field.special_type == null || field.special_type === TYPE.Number);

export const isTime = field => isa(field && field.base_type, TYPE.Time);

export const isAddress = field =>
  isa(field && field.special_type, TYPE.Address);
export const isState = field => isa(field && field.special_type, TYPE.State);
export const isCountry = field =>
  isa(field && field.special_type, TYPE.Country);
export const isCoordinate = field =>
  isa(field && field.special_type, TYPE.Coordinate);
export const isLatitude = field =>
  isa(field && field.special_type, TYPE.Latitude);
export const isLongitude = field =>
  isa(field && field.special_type, TYPE.Longitude);

export const isID = field => isFK(field) || isPK(field);

// operator argument constructors:

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

const OPERATORS = {
  "=": {
    validArgumentsFilters: [equivalentArgument],
    multi: true,
  },
  "!=": {
    validArgumentsFilters: [equivalentArgument],
    multi: true,
  },
  IS_NULL: {
    validArgumentsFilters: [],
  },
  NOT_NULL: {
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
  INSIDE: {
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
  BETWEEN: {
    validArgumentsFilters: [comparableArgument, comparableArgument],
  },
  STARTS_WITH: {
    validArgumentsFilters: [freeformArgument],
    options: CASE_SENSITIVE_OPTION,
    optionsDefaults: { "case-sensitive": false },
  },
  ENDS_WITH: {
    validArgumentsFilters: [freeformArgument],
    options: CASE_SENSITIVE_OPTION,
    optionsDefaults: { "case-sensitive": false },
  },
  CONTAINS: {
    validArgumentsFilters: [freeformArgument],
    options: CASE_SENSITIVE_OPTION,
    optionsDefaults: { "case-sensitive": false },
  },
  DOES_NOT_CONTAIN: {
    validArgumentsFilters: [freeformArgument],
    options: CASE_SENSITIVE_OPTION,
    optionsDefaults: { "case-sensitive": false },
  },
};

const DEFAULT_OPERATORS = [
  { name: "=", verboseName: t`Is` },
  { name: "!=", verboseName: t`Is not` },
  { name: "IS_NULL", verboseName: t`Is empty` },
  { name: "NOT_NULL", verboseName: t`Not empty` },
];

// ordered list of operators and metadata per type
const OPERATORS_BY_TYPE_ORDERED = {
  [NUMBER]: [
    { name: "=", verboseName: t`Equal to` },
    { name: "!=", verboseName: t`Not equal to` },
    { name: ">", verboseName: t`Greater than` },
    { name: "<", verboseName: t`Less than` },
    { name: "BETWEEN", verboseName: t`Between` },
    { name: ">=", verboseName: t`Greater than or equal to` },
    { name: "<=", verboseName: t`Less than or equal to` },
    { name: "IS_NULL", verboseName: t`Is empty` },
    { name: "NOT_NULL", verboseName: t`Not empty` },
  ],
  [STRING]: [
    { name: "=", verboseName: t`Is` },
    { name: "!=", verboseName: t`Is not` },
    { name: "CONTAINS", verboseName: t`Contains` },
    { name: "DOES_NOT_CONTAIN", verboseName: t`Does not contain` },
    { name: "IS_NULL", verboseName: t`Is empty` },
    { name: "NOT_NULL", verboseName: t`Not empty` },
    { name: "STARTS_WITH", verboseName: t`Starts with` },
    { name: "ENDS_WITH", verboseName: t`Ends with` },
  ],
  [STRING_LIKE]: [
    { name: "=", verboseName: t`Is` },
    { name: "!=", verboseName: t`Is not` },
    { name: "IS_NULL", verboseName: t`Is empty` },
    { name: "NOT_NULL", verboseName: t`Not empty` },
  ],
  [DATE_TIME]: [
    { name: "=", verboseName: t`Is` },
    { name: "<", verboseName: t`Before` },
    { name: ">", verboseName: t`After` },
    { name: "BETWEEN", verboseName: t`Between` },
    { name: "IS_NULL", verboseName: t`Is empty` },
    { name: "NOT_NULL", verboseName: t`Not empty` },
  ],
  [LOCATION]: [
    { name: "=", verboseName: t`Is` },
    { name: "!=", verboseName: t`Is not` },
    { name: "IS_NULL", verboseName: t`Is empty` },
    { name: "NOT_NULL", verboseName: t`Not empty` },
  ],
  [COORDINATE]: [
    { name: "=", verboseName: t`Is` },
    { name: "!=", verboseName: t`Is not` },
    { name: "INSIDE", verboseName: t`Inside` },
  ],
  [BOOLEAN]: [
    { name: "=", verboseName: t`Is`, multi: false },
    { name: "IS_NULL", verboseName: t`Is empty` },
    { name: "NOT_NULL", verboseName: t`Not empty` },
  ],
  [FOREIGN_KEY]: DEFAULT_OPERATORS,
  [UNKNOWN]: DEFAULT_OPERATORS,
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

export function getOperators(field, table) {
  const type = getFieldType(field) || UNKNOWN;
  return OPERATORS_BY_TYPE_ORDERED[type].map(operatorForType => {
    const operator = OPERATORS[operatorForType.name];
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

function dimensionFields(fields) {
  return _.filter(fields, isDimension);
}

var Aggregators = [
  {
    name: t`Raw data`,
    short: "rows",
    description: t`Just a table with the rows in the answer, no additional operations.`,
    validFieldsFilters: [],
    requiresField: false,
    requiredDriverFeature: "basic-aggregations",
  },
  {
    name: t`Count of rows`,
    short: "count",
    description: t`Total number of rows in the answer.`,
    validFieldsFilters: [],
    requiresField: false,
    requiredDriverFeature: "basic-aggregations",
  },
  {
    name: t`Sum of ...`,
    short: "sum",
    description: t`Sum of all the values of a column.`,
    validFieldsFilters: [summableFields],
    requiresField: true,
    requiredDriverFeature: "basic-aggregations",
  },
  {
    name: t`Average of ...`,
    short: "avg",
    description: t`Average of all the values of a column`,
    validFieldsFilters: [summableFields],
    requiresField: true,
    requiredDriverFeature: "basic-aggregations",
  },
  {
    name: t`Number of distinct values of ...`,
    short: "distinct",
    description: t`Number of unique values of a column among all the rows in the answer.`,
    validFieldsFilters: [allFields],
    requiresField: true,
    requiredDriverFeature: "basic-aggregations",
  },
  {
    name: t`Cumulative sum of ...`,
    short: "cum_sum",
    description: t`Additive sum of all the values of a column.\ne.x. total revenue over time.`,
    validFieldsFilters: [summableFields],
    requiresField: true,
    requiredDriverFeature: "basic-aggregations",
  },
  {
    name: t`Cumulative count of rows`,
    short: "cum_count",
    description: t`Additive count of the number of rows.\ne.x. total number of sales over time.`,
    validFieldsFilters: [],
    requiresField: false,
    requiredDriverFeature: "basic-aggregations",
  },
  {
    name: t`Standard deviation of ...`,
    short: "stddev",
    description: t`Number which expresses how much the values of a column vary among all rows in the answer.`,
    validFieldsFilters: [summableFields],
    requiresField: true,
    requiredDriverFeature: "standard-deviation-aggregations",
  },
  {
    name: t`Minimum of ...`,
    short: "min",
    description: t`Minimum value of a column`,
    validFieldsFilters: [summableFields],
    requiresField: true,
    requiredDriverFeature: "basic-aggregations",
  },
  {
    name: t`Maximum of ...`,
    short: "max",
    description: t`Maximum value of a column`,
    validFieldsFilters: [summableFields],
    requiresField: true,
    requiredDriverFeature: "basic-aggregations",
  },
];

var BreakoutAggregator = {
  name: t`Break out by dimension`,
  short: "breakout",
  validFieldsFilters: [dimensionFields],
};

function populateFields(aggregator, fields) {
  return {
    name: aggregator.name,
    short: aggregator.short,
    description: aggregator.description || "",
    advanced: aggregator.advanced || false,
    fields: _.map(aggregator.validFieldsFilters, function(validFieldsFilterFn) {
      return validFieldsFilterFn(fields);
    }),
    validFieldsFilters: aggregator.validFieldsFilters,
    requiresField: aggregator.requiresField,
    requiredDriverFeature: aggregator.requiredDriverFeature,
  };
}

// TODO: unit test
export function getAggregators(table) {
  const supportedAggregations = Aggregators.filter(function(agg) {
    return !(
      agg.requiredDriverFeature &&
      table.db &&
      !_.contains(table.db.features, agg.requiredDriverFeature)
    );
  });
  return _.map(supportedAggregations, function(aggregator) {
    return populateFields(aggregator, table.fields);
  });
}

export function getAggregatorsWithFields(table) {
  return getAggregators(table).filter(
    aggregation =>
      !aggregation.requiresField ||
      aggregation.fields.reduce((ok, fields) => ok && fields.length > 0, true),
  );
}

// TODO: unit test
export function getAggregator(short) {
  return _.findWhere(Aggregators, { short: short });
}

export const isCompatibleAggregatorForField = (aggregator, field) =>
  aggregator.validFieldsFilters.every(filter => filter([field]).length === 1);

export function getBreakouts(fields) {
  var result = populateFields(BreakoutAggregator, fields);
  result.fields = result.fields[0];
  result.validFieldsFilter = result.validFieldsFilters[0];
  return result;
}

export function addValidOperatorsToFields(table) {
  for (let field of table.fields) {
    field.operators = getOperators(field, table);
  }
  table.aggregation_options = getAggregatorsWithFields(table);
  table.breakout_options = getBreakouts(table.fields);
  return table;
}

export function hasLatitudeAndLongitudeColumns(columnDefs) {
  let hasLatitude = false;
  let hasLongitude = false;
  for (const col of columnDefs) {
    if (isa(col.special_type, TYPE.Latitude)) {
      hasLatitude = true;
    }
    if (isa(col.special_type, TYPE.Longitude)) {
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
  [DATE_TIME]: "calendar",
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

export function computeMetadataStrength(table) {
  var total = 0;
  var completed = 0;
  function score(value) {
    total++;
    if (value) {
      completed++;
    }
  }

  score(table.description);
  if (table.fields) {
    table.fields.forEach(function(field) {
      score(field.description);
      score(field.special_type);
      if (isFK(field)) {
        score(field.target);
      }
    });
  }

  return completed / total;
}

export function getFilterArgumentFormatOptions(operator, index) {
  return (
    (operator && operator.formatOptions && operator.formatOptions[index]) || {}
  );
}
