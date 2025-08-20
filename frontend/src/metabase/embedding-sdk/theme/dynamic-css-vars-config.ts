import type { DynamicCssVarConfig } from "../types/private/css-variables";

/**
 * Custom CSS variables that don't correspond to SDK color mappings.
 * These are always applied and can't be overridden by user-defined colors.
 */
export const DYNAMIC_CSS_VARIABLES: DynamicCssVarConfig = {
  "--mb-color-bg-sdk-question-toolbar": {
    light: { source: "background", darken: 0.04 },
    dark: { source: "background", lighten: 0.5 },
  },
  "--mb-color-notebook-step-bg": {
    light: { source: "background", darken: 0.05 },
    dark: { source: "background", lighten: 0.5 },
  },
  "--mb-color-notebook-step-bg-hover": {
    light: { source: "background", darken: 0.1 },
    dark: { source: "background", lighten: 0.4 },
  },
  "--mb-color-background-hover": {
    dark: { source: "background", lighten: 0.5 },
  },
  "--mb-color-bg-error": {
    dark: { source: "negative", alpha: 0.1 },
  },
};
