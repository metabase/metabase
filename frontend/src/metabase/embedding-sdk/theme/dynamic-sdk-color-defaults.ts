import type { DynamicSdkDefaultColorConfig } from "../types/private/css-variables";

/**
 * Define theme-aware color defaults for the embedding SDK.
 * These will be applied when the user hasn't defined these colors explicitly.
 */
export const DYNAMIC_SDK_DEFAULT_COLORS_CONFIG: DynamicSdkDefaultColorConfig = {
  "background-hover": {
    light: { source: "bg-white", darken: 0.05 },
    dark: { source: "bg-white", lighten: 0.5 },
  },
  "background-disabled": {
    light: { source: "bg-white", darken: 0.1 },
    dark: { source: "bg-white", lighten: 0.2 },
  },
  "text-secondary": {
    light: { source: "text-dark", alpha: 0.7 },
    dark: { source: "text-white", alpha: 0.7 },
  },
  "text-tertiary": {
    light: { source: "text-dark", alpha: 0.5 },
    dark: { source: "text-white", alpha: 0.5 },
  },
  border: {
    light: { source: "border", alpha: 0.7 },
    dark: { source: "border", alpha: 0.7 },
  },
  "brand-hover": {
    light: { source: "brand", lighten: 0.4 },
    dark: { source: "brand", lighten: 0.3 },
  },
  "brand-hover-light": {
    light: { source: "brand", lighten: 0.6 },
    dark: { source: "brand", lighten: 0.3 },
  },
};
