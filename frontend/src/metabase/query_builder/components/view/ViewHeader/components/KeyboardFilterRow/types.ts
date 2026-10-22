import type * as Lib from "metabase-lib";
import type { IconName } from "metabase-types/api";

export type SuggestionOption = {
  value: string;
  label: string;
  icon?: IconName;
  isChecked?: boolean;
};

export type SuggestionGroup = {
  label?: string;
  options: SuggestionOption[];
};

/**
 * How the user enters the values of an operator:
 * - `none`: the operator needs no values, so selecting it applies the filter;
 * - `single`: one value;
 * - `range`: exactly two values, like `between`;
 * - `multi`: one or more values, separated with commas.
 */
export type ValueKind = "none" | "single" | "range" | "multi";

export type DraftOperator = {
  key: string;
  label: string;
  valueKind: ValueKind;
  isNumeric: boolean;
  getFilterClause: (values: string[]) => Lib.ExpressionClause | undefined;
};

/** Columns of the same kind have the same operators. */
export type ColumnKind = "boolean" | "number" | "string" | "other";

export type DraftColumn = {
  column: Lib.ColumnMetadata;
  label: string;
  kind: ColumnKind;
  /** Undefined when the inline pill does not support the column. */
  operators: DraftOperator[] | undefined;
};

export type DraftState = {
  column?: DraftColumn;
  operator?: DraftOperator;
  values: string[];
};
