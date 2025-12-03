import type { MetabaseColor } from "metabase/embedding-sdk/theme";

export type ColorOperation = {
  /** The color to use as a source for generating the CSS variable. **/
  source: MetabaseColor;

  /** Lightens the color by the given amount. **/
  lighten?: number;

  /** Darkens the color by the given amount. **/
  darken?: number;

  /** Sets the alpha value of the color. **/
  alpha?: number;
};

/**
 * Applies different color operations to light and dark themes.
 */
export type DynamicColorDefinition = {
  light?: ColorOperation;
  dark?: ColorOperation;
};

export type DynamicCssVarConfig = Record<string, DynamicColorDefinition>;
