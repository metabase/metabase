import type { SemanticColorKey } from "metabase/embedding-sdk/theme/embedding-color-palette";
import type { ColorName } from "metabase/lib/colors/types";

export type SourceColorKey = ColorName | SemanticColorKey;

export type ColorOperation = {
  /** The color to use as a source for generating the CSS variable. **/
  source: SourceColorKey;

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
export type DynamicCssVarColorDefinition = {
  light?: ColorOperation;
  dark?: ColorOperation;
};

export type DynamicCssVarConfig = Record<string, DynamicCssVarColorDefinition>;
