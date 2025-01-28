import type { DynamicCssVarConfig } from "../types/private/css-variables";

/**
 * These CSS variables are dynamically generated based on the theme.
 */
export const DYNAMIC_CSS_VARIABLES: DynamicCssVarConfig = {
  "--mb-color-notebook-step-bg": {
    source: "bg-white",
    light: { darken: 0.05 },
    dark: { lighten: 0.5 },
  },
  "--mb-color-notebook-step-bg-hover": {
    source: "bg-white",
    light: { darken: 0.1 },
    dark: { lighten: 0.4 },
  },
  "--mb-color-background-hover": {
    source: { dark: "bg-white" },
    dark: { lighten: 0.5 },
  },
};
