import type { SemanticColorKey } from "metabase/embedding-sdk/theme/embedding-color-palette";
import type { ColorName } from "metabase/lib/colors/types";

export type SourceColorKey = ColorName | SemanticColorKey;

export type ColorOperation = {
  lighten?: number;
  darken?: number;
  alpha?: number;
};

export type DynamicCssVarColorDefinition = {
  /**
   * The color to use as a source for generating the CSS variable.
   * If the value is an object, it will use the light color for light themes and the dark color for dark themes.
   **/
  source: SourceColorKey | { light?: SourceColorKey; dark?: SourceColorKey };

  // applies different operations to light and dark themes
  light?: ColorOperation;
  dark?: ColorOperation;
};

export type DynamicCssVarConfig = Record<string, DynamicCssVarColorDefinition>;
