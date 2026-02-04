export type StringFilterOperator =
  | "="
  | "!="
  | "contains"
  | "does-not-contain"
  | "is-empty"
  | "not-empty"
  | "starts-with"
  | "ends-with";

export type NumberFilterOperator =
  | "="
  | "!="
  | ">"
  | "<"
  | "between"
  | ">="
  | "<="
  | "is-null"
  | "not-null";

export type CoordinateFilterOperator =
  | "="
  | "!="
  | "inside"
  | ">"
  | "<"
  | "between"
  | ">="
  | "<=";

export type BooleanFilterOperator = "=" | "is-null" | "not-null";

export type SpecificDateFilterOperator = "=" | ">" | "<" | "between";

export type ExcludeDateFilterOperator = "!=" | "is-null" | "not-null";

export type TimeFilterOperator = ">" | "<" | "between" | "is-null" | "not-null";

export type DefaultFilterOperator = "is-null" | "not-null";

export type RelativeDateFilterUnit =
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year";

export type ExcludeDateFilterUnit =
  | "hour-of-day"
  | "day-of-week"
  | "month-of-year"
  | "quarter-of-year";

export type NumberFilterValue = number | bigint;

export type StringFilterOptions = {
  caseSensitive?: boolean;
};

export type RelativeDateFilterOptions = {
  includeCurrent?: boolean;
};
