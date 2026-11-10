import type {
  BooleanPrototypeSetting,
  NumberPrototypeSetting,
  PrototypeSetting,
  SegmentedPrototypeSetting,
} from "./types";

export const EXPRESSION_AI_COMPLETION_SETTING: SegmentedPrototypeSetting = {
  key: "expression-ai-completion-engine",
  type: "segmented",
  label: "AI completion in custom expressions",
  description:
    "Ghost text at the cursor after a pause in typing. Tab accepts it. On-device uses Gemini Nano in Chrome.",
  options: [
    { value: "off", label: "Off" },
    { value: "server", label: "Server" },
    { value: "on-device", label: "On-device" },
  ],
  defaultValue: "server",
};

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

export const EXPRESSION_AI_COMPLETION_DELAY_SETTING: NumberPrototypeSetting = {
  key: "expression-ai-completion-delay",
  type: "number",
  label: "AI completion delay (ms)",
  description: "How long to wait after the last key press before the request.",
  defaultValue: 300,
  min: 0,
  max: 3000,
};

/**
 * The settings of the current prototype, in the order the prototype settings
 * submenu shows them. Each prototype branch lists its own settings here and
 * reads them with `usePrototypeSetting`. See PROTOTYPE.md.
 */
export const PROTOTYPE_SETTINGS: readonly PrototypeSetting[] = [
  EXPRESSION_AI_COMPLETION_SETTING,
  EXPRESSION_AI_COMPLETION_DELAY_SETTING,
  EXPRESSION_PARAMETER_HINTS_SETTING,
  EXPRESSION_COLUMNS_OUTSIDE_BRACKETS_SETTING,
  EXPRESSION_SQL_FIXES_SETTING,
];
