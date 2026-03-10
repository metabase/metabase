import type { EmbedFlowDerivedDefaultColorConfig } from "./types";

/**
 * Define theme-aware color defaults for the embedding SDK.
 * These will be applied when the user hasn't defined these colors explicitly.
 */
export const EMBED_FLOW_DERIVED_COLORS_CONFIG: EmbedFlowDerivedDefaultColorConfig =
  {
    "background-disabled": {
      light: { source: "background", darken: 0.03 },
      dark: { source: "background", lighten: 0.2 },
    },
    "background-secondary": {
      light: { source: "background", darken: 0.02 },
      dark: { source: "background", darken: 0.2 },
    },
    "text-secondary": {
      light: { source: "text-primary", lighten: 0.3 },
      dark: { source: "text-primary", darken: 0.3 },
    },
    "text-tertiary": {
      light: { source: "text-primary", lighten: 0.6 },
      dark: { source: "text-primary", darken: 0.6 },
    },
    border: {
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
