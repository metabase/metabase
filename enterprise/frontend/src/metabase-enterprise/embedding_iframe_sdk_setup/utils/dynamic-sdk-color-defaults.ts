import type { EmbedFlowDerivedDefaultColorConfig } from "./types";

/**
 * Define theme-aware color defaults for the embedding SDK.
 * These will be applied when the user hasn't defined these colors explicitly.
 */
export const EMBED_FLOW_DERIVED_COLORS_CONFIG: EmbedFlowDerivedDefaultColorConfig =
  {
    "background-hover": {
      light: { source: "background", darken: 0.01 },
      dark: { source: "background", lighten: 0.5 },
    },
    "background-disabled": {
      light: { source: "background", darken: 0.03 },
      dark: { source: "background", lighten: 0.2 },
    },
    "background-secondary": {
      light: { source: "background", darken: 0.05 },
      dark: { source: "background", lighten: 0.5 },
    },
    "text-secondary": {
      light: { source: "text-primary", alpha: 0.7 },
      dark: { source: "text-primary", alpha: 0.7 },
    },
    "text-tertiary": {
      light: { source: "text-primary", alpha: 0.5 },
      dark: { source: "text-primary", alpha: 0.5 },
    },
    border: {
      light: { source: "border", alpha: 0.7 },
      dark: { source: "border", alpha: 0.7 },
    },
    "brand-hover": {
      light: { source: "brand", lighten: 0.4 },
      dark: { source: "brand", alpha: 0.5 },
    },
    "brand-hover-light": {
      light: { source: "brand", lighten: 0.6 },
      dark: { source: "brand", alpha: 0.3 },
    },
  };
