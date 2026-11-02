import type { ReactNode } from "react";

import type * as Lib from "metabase-lib";
import type { IconName } from "metabase-types/api";

export type SuggestionOption = {
  value: string;
  label: string;
  icon?: IconName;
  /** Shown before the label, like a flag. */
  leftSection?: ReactNode;
  /** Other texts that find this option, like "!=" for "Not equal to". */
  aliases?: string[];
  /** Shown after the label in grey, like a state code. */
  description?: string;
  /** Shown at the right end of the option, like the symbol of an operator. */
  hint?: string;
  isChecked?: boolean;
  /** Some, but not all, of the values that this option selects are checked. */
  isIndeterminate?: boolean;
  /** A "Select all" option, with a stacked checkbox. */
  isSelectAll?: boolean;
  /** The share of the rows with this value, shown on a tile. */
  share?: { value: number; label: string };
  /** Shown but not pickable, like a column that can't go where the caret is. */
  disabled?: boolean;
};

export type SuggestionGroup = {
  /** A header above this group and the next groups with the same section. */
  section?: string;
  /** Shown before the section header, like a table or a foreign key icon. */
  sectionIcon?: IconName;
  label?: string;
  /** A line above the group, between it and the group before. */
  hasDivider?: boolean;
  /** The text of the input does not filter the options of this group. */
  isUnfiltered?: boolean;
  options: SuggestionOption[];
};

/**
 * How the user enters the values of an operator:
 * - `none`: the operator needs no values, so selecting it applies the filter;
 * - `single`: one value;
 * - `range`: exactly two values, like `between`;
 * - `multi`: one or more values, separated with commas;
 * - `date-picker`: one value from a date picker, like a fixed date range. The
 *   value is the `DatePickerValue` as JSON.
 */
export type ValueKind = "none" | "single" | "range" | "multi" | "date-picker";

export type DraftOperator = {
  key: string;
  label: string;
  valueKind: ValueKind;
  isNumeric: boolean;
  /** For number operators: the operator, for the histogram slider. */
  numberOperator?: Lib.NumberFilterOperator;
  /** The label of a value, like a country name for a country code. */
  formatValue?: (value: string) => string | null;
  /**
   * For an operator that is also the value, like "true" of a boolean column:
   * the pill shows "is" and this label as the value.
   */
  pillValueLabel?: string;
  /** The pill shows no operator, like "Created At previous 30 days". */
  hasNoPillOperator?: boolean;
  /**
   * Operators with different groups are split by a divider in the list, like
   * the values and the empty checks of a boolean column.
   */
  group?: number;
  /** For `date-picker` operators: the picker to show. */
  datePickerType?: "specific" | "relative" | "exclude";
  /** The values to pick from, when the column has a fixed set of them. */
  options?: { value: string; label: string }[];
  getFilterClause: (values: string[]) => Lib.ExpressionClause | undefined;
};

/** Columns of the same kind have the same operators. */
export type ColumnKind = "boolean" | "number" | "string" | "date" | "other";

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
