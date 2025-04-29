import { t } from "ttag";

import {
  MBQLClauseCategory as CATEGORY,
  type MBQLClauseDefinition,
  type MBQLClauseFunctionConfig,
} from "./types";

const names = new Set();

function defineClauses<const T extends Record<string, MBQLClauseDefinition>>(
  options: Partial<MBQLClauseDefinition>,
  clauses: T,
): Record<keyof T, MBQLClauseFunctionConfig> {
  const result = {} as Record<keyof T, MBQLClauseFunctionConfig>;
  for (const name in clauses) {
    if (names.has(name)) {
      throw new Error(`Duplicate clause name: ${name}`);
    }
    names.add(name);

    const defn = clauses[name];
    result[name] = {
      ...options,
      name,
      hasOptions: Boolean(defn.hasOptions),
      multiple: Boolean(defn.multiple),
      argType(index) {
        return defn.args[index];
      },
      ...defn,
    };
  }
  return result;
}

const WINDOW = defineClauses(
  { category: CATEGORY.Window },
  {
    "cum-count": {
      displayName: "CumulativeCount",
      type: "aggregation",
      args: [],
    },
    "cum-sum": {
      displayName: "CumulativeSum",
      type: "aggregation",
      args: ["number"],
    },
    offset: {
      displayName: "Offset",
      type: "any", // ideally we'd dynamically infer it from the first argument
      args: ["any", "number"],
      requiresFeature: "window-functions/offset",
      validator(_expr: any, offset: number) {
        if (offset === 0) {
          return t`Row offset cannot be zero`;
        }
      },
      hasOptions: true,
    },
  },
);

const AGGREGATION = defineClauses(
  { category: CATEGORY.Aggregation },
  {
    count: { displayName: "Count", type: "aggregation", args: [] },
    sum: { displayName: "Sum", type: "aggregation", args: ["number"] },
    distinct: {
      displayName: "Distinct",
      type: "aggregation",
      args: ["expression"],
    },
    stddev: {
      displayName: "StandardDeviation",
      type: "aggregation",
      args: ["number"],
      requiresFeature: "standard-deviation-aggregations",
    },
    avg: { displayName: "Average", type: "aggregation", args: ["number"] },
    median: {
      displayName: "Median",
      type: "aggregation",
      args: ["number"],
      requiresFeature: "percentile-aggregations",
    },
    min: { displayName: "Min", type: "aggregation", args: ["expression"] },
    max: { displayName: "Max", type: "aggregation", args: ["expression"] },
    share: { displayName: "Share", type: "aggregation", args: ["boolean"] },
    "count-where": {
      displayName: "CountIf",
      type: "aggregation",
      args: ["boolean"],
    },
    "distinct-where": {
      displayName: "DistinctIf",
      type: "aggregation",
      args: ["number", "boolean"],
      requiresFeature: "distinct-where",
    },
    "sum-where": {
      displayName: "SumIf",
      type: "aggregation",
      args: ["number", "boolean"],
    },
    var: {
      displayName: "Variance",
      type: "aggregation",
      args: ["number"],
      requiresFeature: "standard-deviation-aggregations",
    },
    percentile: {
      displayName: "Percentile",
      type: "aggregation",
      args: ["number", "number"],
      requiresFeature: "percentile-aggregations",
    },
  },
);

const CONVERSION = defineClauses(
  { category: CATEGORY.Conversion },
  {
    text: {
      displayName: "text",
      type: "string",
      args: ["expression"],
      requiresFeature: "expressions/text",
    },
    integer: {
      displayName: "integer",
      type: "number",
      args: ["expression"],
      requiresFeature: "expressions/integer",
    },
    date: {
      displayName: "date",
      type: "datetime",
      args: ["expression"],
      requiresFeature: "expressions/date",
    },
    float: {
      displayName: "float",
      type: "number",
      args: ["expression"],
      requiresFeature: "expressions/float",
    },
  },
);

const STRING = defineClauses(
  { category: CATEGORY.String },
  {
    lower: { displayName: "lower", type: "string", args: ["string"] },
    upper: { displayName: "upper", type: "string", args: ["string"] },
    substring: {
      displayName: "substring",
      type: "string",
      args: ["string", "number", "number"],
      validator(_arg: any, start: number, _length: any) {
        if (start <= 0) {
          return t`Expected positive integer but found ${start}`;
        }
      },
    },
    "split-part": {
      displayName: "splitPart",
      type: "string",
      args: ["string", "string", "number"],
      validator(_arg: any, _delimeter: string, position: number) {
        if (position < 1) {
          return t`Expected positive integer but found ${position}`;
        }
      },
      requiresFeature: "split-part",
    },
    "regex-match-first": {
      displayName: `regexExtract`,
      type: "string",
      args: ["string", "string"],
      requiresFeature: "regex",
    },
    path: {
      displayName: "path",
      type: "string",
      args: ["string"],
      requiresFeature: "regex",
    },
    concat: {
      displayName: "concat",
      type: "string",
      args: ["expression", "expression"],
      multiple: true,
    },
    replace: {
      displayName: "replace",
      type: "string",
      args: ["string", "string", "string"],
    },
    length: { displayName: "length", type: "number", args: ["string"] },
    trim: { displayName: "trim", type: "string", args: ["string"] },
    rtrim: { displayName: "rTrim", type: "string", args: ["string"] },
    ltrim: { displayName: "lTrim", type: "string", args: ["string"] },
    domain: {
      displayName: "domain",
      type: "string",
      args: ["string"],
      requiresFeature: "regex",
    },
    subdomain: {
      displayName: "subdomain",
      type: "string",
      args: ["string"],
      requiresFeature: "regex",
    },
    host: {
      displayName: "host",
      type: "string",
      args: ["string"],
      requiresFeature: "regex",
    },
    contains: {
      displayName: "contains",
      type: "boolean",
      args: ["string", "string"],
      multiple: true,
      hasOptions: true,
    },
    "does-not-contain": {
      displayName: "doesNotContain",
      type: "boolean",
      args: ["string", "string"],
      multiple: true,
      hasOptions: true,
    },
    "starts-with": {
      displayName: "startsWith",
      type: "boolean",
      args: ["string", "string"],
      multiple: true,
      hasOptions: true,
    },
    "ends-with": {
      displayName: "endsWith",
      type: "boolean",
      args: ["string", "string"],
      multiple: true,
      hasOptions: true,
    },
    "is-empty": {
      displayName: "isEmpty",
      type: "boolean",
      args: ["expression"],
    },
    "not-empty": {
      displayName: "notEmpty",
      type: "boolean",
      args: ["expression"],
    },
  },
);

const DATE = defineClauses(
  { category: CATEGORY.Date },
  {
    "month-name": {
      displayName: "monthName",
      type: "string",
      args: ["number"],
    },
    "quarter-name": {
      displayName: "quarterName",
      type: "string",
      args: ["number"],
    },
    "day-name": {
      displayName: "dayName",
      type: "string",
      args: ["number"],
    },
    interval: {
      displayName: "timeSpan",
      type: "number",
      args: ["number", "string"],
    },
    "time-interval": {
      displayName: "interval",
      type: "boolean",
      args: ["expression", "number", "string"],
      hasOptions: true,
    },
    "relative-time-interval": {
      displayName: "intervalStartingFrom",
      type: "boolean",
      args: ["expression", "number", "string", "number", "string"],
    },
    "relative-datetime": {
      displayName: "relativeDateTime",
      type: "expression",
      args: ["number", "string"],
    },
    "get-year": {
      displayName: "year",
      type: "number",
      args: ["datetime"],
    },
    "get-quarter": {
      displayName: "quarter",
      type: "number",
      args: ["datetime"],
    },
    "get-month": {
      displayName: "month",
      type: "number",
      args: ["datetime"],
    },
    "get-week": {
      displayName: "week",
      type: "number",
      args: ["datetime"],
      hasOptions: true, // optional mode parameter
    },
    "get-day": {
      displayName: "day",
      type: "number",
      args: ["datetime"],
    },
    "get-day-of-week": {
      displayName: "weekday",
      type: "number",
      args: ["datetime"],
      hasOptions: true, // optional mode parameter
    },
    "get-hour": {
      displayName: "hour",
      type: "number",
      args: ["datetime"],
    },
    "get-minute": {
      displayName: "minute",
      type: "number",
      args: ["datetime"],
    },
    "get-second": {
      displayName: "second",
      type: "number",
      args: ["datetime"],
    },
    "datetime-diff": {
      displayName: "datetimeDiff",
      type: "number",
      args: ["datetime", "datetime", "string"],
      requiresFeature: "datetime-diff",
    },
    "datetime-add": {
      displayName: "datetimeAdd",
      type: "datetime",
      args: ["datetime", "number", "string"],
    },
    "datetime-subtract": {
      displayName: "datetimeSubtract",
      type: "datetime",
      args: ["datetime", "number", "string"],
    },
    now: {
      displayName: "now",
      type: "datetime",
      args: [],
    },
    "convert-timezone": {
      displayName: "convertTimezone",
      type: "datetime",
      args: ["datetime", "string"],
      hasOptions: true,
      requiresFeature: "convert-timezone",
    },
  },
);

const MATH = defineClauses(
  { category: CATEGORY.Math },
  {
    abs: {
      displayName: "abs",
      type: "number",
      args: ["number"],
      requiresFeature: "expressions",
    },
    floor: {
      displayName: "floor",
      type: "number",
      args: ["number"],
      requiresFeature: "expressions",
    },
    ceil: {
      displayName: "ceil",
      type: "number",
      args: ["number"],
      requiresFeature: "expressions",
    },
    round: {
      displayName: "round",
      type: "number",
      args: ["number"],
      requiresFeature: "expressions",
    },
    sqrt: {
      displayName: "sqrt",
      type: "number",
      args: ["number"],
      requiresFeature: "advanced-math-expressions",
    },
    power: {
      displayName: "power",
      type: "number",
      args: ["number", "number"],
      requiresFeature: "advanced-math-expressions",
    },
    log: {
      displayName: "log",
      type: "number",
      args: ["number"],
      requiresFeature: "advanced-math-expressions",
    },
    exp: {
      displayName: "exp",
      type: "number",
      args: ["number"],
      requiresFeature: "advanced-math-expressions",
    },
  },
);

const LOGICAL = defineClauses(
  { category: CATEGORY.Logical },
  {
    between: {
      displayName: "between",
      type: "boolean",
      args: ["expression", "expression", "expression"],
    },
    "is-null": {
      displayName: "isNull",
      type: "boolean",
      args: ["expression"],
    },
    "not-null": {
      displayName: "notNull",
      type: "boolean",
      args: ["expression"],
    },
    coalesce: {
      displayName: "coalesce",
      type: "expression",
      args: ["expression", "expression"],
      argType(_index, _args, type) {
        return type;
      },
      multiple: true,
    },
    case: {
      displayName: "case",
      type: "expression",
      multiple: true,
      args: ["expression", "expression"], // ideally we'd alternate boolean/expression
      argType(index, args, type) {
        const len = args.length;
        if (len % 2 === 1 && index === len - 1) {
          return type;
        }
        if (index % 2 === 1) {
          return type;
        }
        return "boolean";
      },
    },
    if: {
      displayName: "if",
      type: "expression",
      multiple: true,
      args: ["expression", "expression"],
      argType(index, args, type) {
        const len = args.length;
        if (len % 2 === 1 && index === len - 1) {
          return type;
        }
        if (index % 2 === 1) {
          return type;
        }
        return "boolean";
      },
    },
    //"in` and `not-in` are aliases for `=` and `!="
    in: {
      displayName: "in",
      type: "boolean",
      args: ["expression", "expression"],
      multiple: true,
    },
    "not-in": {
      displayName: "notIn",
      type: "boolean",
      args: ["expression", "expression"],
      multiple: true,
    },
  },
);

const LOGICAL_OPERATORS = defineClauses(
  {},
  {
    and: {
      displayName: "AND",
      type: "boolean",
      multiple: true,
      args: ["boolean", "boolean"],
      argType() {
        return "boolean";
      },
    },
    or: {
      displayName: "OR",
      type: "boolean",
      multiple: true,
      args: ["boolean", "boolean"],
      argType() {
        return "boolean";
      },
    },
    not: {
      displayName: "NOT",
      type: "boolean",
      args: ["boolean"],
    },
  },
);

const NUMERIC_OPERATORS = defineClauses(
  {},
  {
    "*": {
      displayName: "*",
      type: "number",
      args: ["number", "number"],
      multiple: true,
      argType(_index, _args, type) {
        if (type === "aggregation") {
          return "aggregation";
        }
        return "number";
      },
    },
    "/": {
      displayName: "/",
      type: "number",
      args: ["number", "number"],
      multiple: true,
      argType(_index, _args, type) {
        if (type === "aggregation") {
          return "aggregation";
        }
        return "number";
      },
    },
    "-": {
      displayName: "-",
      type: "number",
      args: ["number", "number"],
      multiple: true,
      argType(_index, _args, type) {
        if (type === "aggregation") {
          return "aggregation";
        }
        return "number";
      },
    },
    "+": {
      displayName: "+",
      type: "number",
      args: ["number", "number"],
      multiple: true,
      argType(_index, _args, type) {
        if (type === "aggregation") {
          return "aggregation";
        }
        return "number";
      },
    },
  },
);

const EQUALITY_OPERATORS = defineClauses(
  {},
  {
    "=": {
      displayName: "=",
      type: "boolean",
      args: ["expression", "expression"],
    },
    "!=": {
      displayName: "!=",
      type: "boolean",
      args: ["expression", "expression"],
    },
  },
);

export const COMPARISON_OPERATORS = defineClauses(
  {},
  {
    "<=": {
      displayName: "<=",
      type: "boolean",
      args: ["expression", "expression"],
    },
    ">=": {
      displayName: ">=",
      type: "boolean",
      args: ["expression", "expression"],
    },
    "<": {
      displayName: "<",
      type: "boolean",
      args: ["expression", "expression"],
    },
    ">": {
      displayName: ">",
      type: "boolean",
      args: ["expression", "expression"],
    },
  },
);

export const EXPRESSION_OPERATORS = {
  ...LOGICAL_OPERATORS,
  ...NUMERIC_OPERATORS,
  ...EQUALITY_OPERATORS,
  ...COMPARISON_OPERATORS,
} as const;

export const AGGREGATION_FUNCTIONS = {
  ...AGGREGATION,
  ...WINDOW,
} as const;

export const EXPRESSION_FUNCTIONS = {
  ...CONVERSION,
  ...STRING,
  ...DATE,
  ...MATH,
  ...LOGICAL,
} as const;

export const MBQL_CLAUSES = {
  ...AGGREGATION_FUNCTIONS,
  ...EXPRESSION_FUNCTIONS,
  ...EXPRESSION_OPERATORS,
} as const;
