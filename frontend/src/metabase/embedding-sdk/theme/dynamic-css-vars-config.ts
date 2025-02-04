import type { DynamicCssVarConfig } from "../types/private/css-variables";

/**
 * These CSS variables are dynamically generated based on the theme.
 */
export const DYNAMIC_CSS_VARIABLES: DynamicCssVarConfig = {
  "--mb-color-notebook-step-bg": {
    light: { source: "bg-white", darken: 0.05 },
    dark: { source: "bg-white", lighten: 0.5 },
  },
  "--mb-color-notebook-step-bg-hover": {
    light: { source: "bg-white", darken: 0.1 },
    dark: { source: "bg-white", lighten: 0.4 },
  },
  "--mb-color-background-hover": {
    dark: { source: "bg-white", lighten: 0.5 },
  },
  "--mb-color-bg-error": {
    dark: { source: "error", alpha: 0.3 },
  },
};
