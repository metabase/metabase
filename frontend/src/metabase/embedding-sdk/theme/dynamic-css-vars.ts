import { darken, isDark, lighten } from "metabase/lib/colors";
import type { ColorName } from "metabase/lib/colors/types";
import type { MantineTheme } from "metabase/ui";

import type { SemanticColorKey } from "./embedding-color-palette";

type SourceColorKey = ColorName | SemanticColorKey;

type DynamicCssVarColorDefinition = {
  source: SourceColorKey;
  darkenBy: number;
  lightenBy: number;
};

/**
 * These CSS variables are dynamically generated based on the theme.
 */
export const THEME_DEPENDENT_CSS_VARS = {
  "--mb-color-notebook-step-bg": {
    source: "bg-white",
    darkenBy: 0.1,
    lightenBy: 0.1,
  },
  "--mb-color-notebook-step-bg-hover": {
    source: "bg-white",
    darkenBy: 0.2,
    lightenBy: 0.2,
  },
} satisfies Record<string, DynamicCssVarColorDefinition>;

export function getDynamicCssVarsFromTheme(
  theme: MantineTheme,
): Record<string, string> {
  const isDarkTheme = theme.colors?.background
    ? isDark(theme.other.colors.background)
    : false;

  return Object.entries(THEME_DEPENDENT_CSS_VARS).reduce(
    (mapping, [cssVar, { source: sourceColorKey, lightenBy, darkenBy }]) => {
      // We store the same color for all 8 shades in our theme.colors mapping.
      const sourceColor = theme.colors[sourceColorKey]?.[0];

      const finalColor = isDarkTheme
        ? lighten(sourceColor, lightenBy)
        : darken(sourceColor, darkenBy);

      return { ...mapping, [cssVar]: finalColor };
    },
    {},
  );
}
