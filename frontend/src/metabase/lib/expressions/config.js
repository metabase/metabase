import { t } from "ttag";

// Reserved token names
const MBQL_TO_EXPRESSION_NAME = new Map(
  Object.entries({
    // aggregations
    count: t`Count`,
    "cum-count": t`CumulativeCount`,
    sum: t`Sum`,
    "cum-sum": t`CumulativeSum`,
    distinct: t`Distinct`,
    stddev: t`StandardDeviation`,
    avg: t`Average`,
    min: t`Min`,
    max: t`Max`,
    share: t`Share`,
    "count-where": t`CountWhere`,
    "sum-where": t`SumWhere`,
    // functions
    lower: t`Lower`,
    upper: t`Upper`,
    substring: t`Substring`,
    extract: t`Extract`,
    concat: t`Concat`,
    coalesce: t`Coalesce`,
    replace: t`Replace`,
    trim: t`Trim`,
    rtrim: t`RightTrim`,
    ltrim: t`LeftTrim`,
    case: t`Case`,
    // filters
    contains: t`Contains`,
    and: t`AND`,
    or: t`OR`,
  }),
);
const EXPRESSION_TO_MBQL_NAME = new Map(
  Array.from(MBQL_TO_EXPRESSION_NAME).map(([mbqlName, expressionName]) =>
    // case-insensitive
    [expressionName.toLowerCase(), mbqlName],
  ),
);

export function getExpressionName(mbqlName) {
  return MBQL_TO_EXPRESSION_NAME.get(mbqlName);
}
export function getMBQLName(expressionName) {
  // case-insensitive
  return EXPRESSION_TO_MBQL_NAME.get(expressionName.toLowerCase());
}

export const OPERATORS = new Set(["+", "-", "*", "/"]);

export const AGGREGATIONS = new Set([
  // count-where/sum-where must come before count/sum
  "count-where",
  "sum-where",
  "count",
  "cum-count",
  "sum",
  "cum-sum",
  "distinct",
  "stddev",
  "avg",
  "min",
  "max",
  "share",
]);

export const AGGREGATION_ARGUMENTS = {
  count: [],
  "cum-count": [],
  sum: ["expression"],
  "cum-sum": ["expression"],
  distinct: ["expression"],
  stddev: ["expression"],
  avg: ["expression"],
  min: ["expression"],
  max: ["expression"],
  share: ["filter"],
  "count-where": ["filter"],
  "sum-where": ["expression", "filter"],
};

// the order of these matters for the lexer
export const FILTER_OPERATORS = new Set([
  "!=",
  "<=",
  ">=",
  "<",
  ">",
  "=",
  "and",
  "or",
  "not",
]);

export const FILTERS = new Set(["contains"]);

export const FUNCTIONS = new Set([
  "lower", // concrete-field
  "upper", // concrete-field
  "substring", // concrete-field start length
  "extract", // concrete-field regex
  "concat", // & expression
  "coalesce", // & expression
  "replace", // concrete-field from to
  "trim", // concrete-field
  "rtrim", // concrete-field
  "ltrim", // concrete-field
]);
