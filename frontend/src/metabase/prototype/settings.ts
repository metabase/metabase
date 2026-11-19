import type {
  BooleanPrototypeSetting,
  PrototypeSetting,
  SegmentedPrototypeSetting,
} from "./types";

export const EXPRESSION_EDITOR_VERSION_SETTING: SegmentedPrototypeSetting = {
  key: "expression-editor-version",
  type: "segmented",
  label: "Expression editor",
  description:
    "A: one code editor for everything: an expression, a request in words, or an inline AI prompt; templates and functions in the side panel. B: separate AI and code modes; a prompt by default, = or the f button to write code, and f again to ask the AI about the code. C: like B, with a + menu at the start of the input for the modes and for converting SQL, Python or Excel.",
  options: [
    { value: "a", label: "Version A" },
    { value: "b", label: "Version B" },
    { value: "c", label: "Version C" },
  ],
  defaultValue: "a",
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

export const EXPRESSION_HIDE_AI_SETTING: BooleanPrototypeSetting = {
  key: "expression-hide-ai",
  type: "boolean",
  label: "Custom expressions as without an AI provider",
  description:
    "Hide the AI in custom expressions, as on an instance with no AI provider. Without a provider the AI is always hidden.",
  defaultValue: false,
};

export const EXPRESSION_PREVIEW_CONTEXT_SETTING: SegmentedPrototypeSetting = {
  key: "expression-preview-context",
  type: "segmented",
  label: "Context columns in the expression preview",
  description:
    "Columns that the expression doesn't use but that tell what a row is about, like a title. On-device AI picks them with Gemini Nano in Chrome, and uses the title when the model isn't there.",
  options: [
    { value: "off", label: "Off" },
    { value: "heuristic", label: "Title" },
    { value: "model", label: "On-device AI" },
  ],
  defaultValue: "model",
};

/**
 * The settings of the current prototype, in the order the prototype settings
 * submenu shows them. Each prototype branch lists its own settings here and
 * reads them with `usePrototypeSetting`. See PROTOTYPE.md.
 */
export const PROTOTYPE_SETTINGS: readonly PrototypeSetting[] = [
  EXPRESSION_EDITOR_VERSION_SETTING,
  EXPRESSION_COLUMNS_OUTSIDE_BRACKETS_SETTING,
  EXPRESSION_SQL_FIXES_SETTING,
  EXPRESSION_HIDE_AI_SETTING,
  EXPRESSION_PREVIEW_CONTEXT_SETTING,
];
