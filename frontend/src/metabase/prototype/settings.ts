import type {
  BooleanPrototypeSetting,
  PrototypeSetting,
  SegmentedPrototypeSetting,
} from "./types";

export const EXPRESSION_PARAMETER_HINTS_SETTING: SegmentedPrototypeSetting = {
  key: "expression-parameter-hints",
  type: "segmented",
  label: "Parameter name hints in custom expressions",
  description:
    "Labels with the parameter name before the arguments of a function call, like the inlay hints of VS Code.",
  options: [
    { value: "off", label: "Off" },
    { value: "literals", label: "Literals" },
    { value: "all", label: "All" },
  ],
  defaultValue: "all",
};

export const EXPRESSION_COLUMNS_OUTSIDE_BRACKETS_SETTING: BooleanPrototypeSetting =
  {
    key: "expression-columns-outside-brackets",
    type: "boolean",
    label: "Suggest columns outside [ ] in custom expressions",
    description: "Off: autocomplete suggests columns only after you type [.",
    defaultValue: true,
  };

export const EXPRESSION_SQL_FIXES_SETTING: BooleanPrototypeSetting = {
  key: "expression-sql-fixes",
  type: "boolean",
  label: "Fixes for SQL syntax in custom expressions",
  description:
    "When an invalid expression has SQL, like [Total] IS NULL, suggest the custom expression for it.",
  defaultValue: true,
};

export const EXPRESSION_CASE_COUNTS_SETTING: BooleanPrototypeSetting = {
  key: "expression-case-counts",
  type: "boolean",
  label: "Row counts of case branches in custom expressions",
  description:
    "Chips with the number of rows that each condition of a case() or if() matches. Each change runs a count query.",
  defaultValue: true,
};

export const EXPRESSION_DEBUGGER_DISPLAY_SETTING: SegmentedPrototypeSetting = {
  key: "expression-debugger-display",
  type: "segmented",
  label: "Steps of the row evaluation in custom expressions",
  description:
    "List: all steps one below the other. Stepper: one step at a time, with buttons and a slider to move through them.",
  options: [
    { value: "list", label: "List" },
    { value: "stepper", label: "Stepper" },
  ],
  defaultValue: "stepper",
};

/**
 * The settings of the current prototype, in the order the prototype settings
 * submenu shows them. Each prototype branch lists its own settings here and
 * reads them with `usePrototypeSetting`. See PROTOTYPE.md.
 */
export const PROTOTYPE_SETTINGS: readonly PrototypeSetting[] = [
  EXPRESSION_PARAMETER_HINTS_SETTING,
  EXPRESSION_COLUMNS_OUTSIDE_BRACKETS_SETTING,
  EXPRESSION_SQL_FIXES_SETTING,
  EXPRESSION_CASE_COUNTS_SETTING,
  EXPRESSION_DEBUGGER_DISPLAY_SETTING,
];
