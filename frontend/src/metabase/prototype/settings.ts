import type { BooleanPrototypeSetting, PrototypeSetting } from "./types";

export const EXPRESSION_HIDE_AI_SETTING: BooleanPrototypeSetting = {
  key: "expression-hide-ai",
  type: "boolean",
  label: "Custom expressions as without an AI provider",
  description:
    "Hide the AI in custom expressions, as on an instance with no AI provider. Without a provider the AI is always hidden.",
  defaultValue: false,
};

/**
 * The settings of the current prototype, in the order the prototype settings
 * submenu shows them. Each prototype branch lists its own settings here and
 * reads them with `usePrototypeSetting`. See PROTOTYPE.md.
 */
export const PROTOTYPE_SETTINGS: readonly PrototypeSetting[] = [
  EXPRESSION_HIDE_AI_SETTING,
];
