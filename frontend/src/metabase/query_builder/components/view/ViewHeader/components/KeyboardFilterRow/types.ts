import type { ReactNode } from "react";

import type * as Lib from "metabase-lib";
import type { IconName } from "metabase-types/api";

export type SuggestionOption = {
  value: string;
  label: string;
  icon?: IconName;
  /** Shown before the label, like a flag. */
  leftSection?: ReactNode;
  /** Shown after the label in grey, like a state code. */
  description?: string;
  isChecked?: boolean;
};

export type SuggestionGroup = {
  /** A header above this group and the next groups with the same section. */
  section?: string;
  label?: string;
  /** The text of the input does not filter the options of this group. */
  isUnfiltered?: boolean;
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
  /** For number operators: the operator, for the histogram slider. */
  numberOperator?: Lib.NumberFilterOperator;
  /** The label of a value, like a country name for a country code. */
  formatValue?: (value: string) => string | null;
  /** The values to pick from, when the column has a fixed set of them. */
  options?: { value: string; label: string }[];
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
