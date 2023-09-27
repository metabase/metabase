export const MATH_OPERATORS = ["+", "-", "*", "/"] as const;

export const TEXT_OPERATORS = [
  "=",
  "!=",
  "contains",
  "does-not-contain",
  "is-null",
  "not-null",
  "is-empty",
  "not-empty",
  "starts-with",
  "ends-with",
] as const;

export const NUMBER_OPERATORS = [
  "=",
  "!=",
  ">",
  "<",
  "between",
  ">=",
  "<=",
  "is-null",
  "not-null",
] as const;

export const BOOLEAN_OPERATORS = ["=", "is-null", "not-null"] as const;

export const DATE_OPERATORS = [
  "interval",
  "time-interval",
  "relative-datetime",
] as const;

export const EXPRESSION_OPERATORS = [
  ...MATH_OPERATORS,
  ...TEXT_OPERATORS,
  ...NUMBER_OPERATORS,
  ...BOOLEAN_OPERATORS,
  ...DATE_OPERATORS,
];
