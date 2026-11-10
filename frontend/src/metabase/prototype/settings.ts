import type {
  BooleanPrototypeSetting,
  NumberPrototypeSetting,
  PrototypeSetting,
} from "./types";

export const EXPRESSION_AI_COMPLETION_SETTING: BooleanPrototypeSetting = {
  key: "expression-ai-completion",
  type: "boolean",
  label: "AI completion in custom expressions",
  description:
    "Ghost text at the cursor after a pause in typing. Tab accepts it.",
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
];
