// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
import { getIn } from "icepick";

import { CSS_VARIABLES_TO_SDK_THEME_MAP } from "metabase/embedding-sdk/theme/css-vars-to-sdk-theme";
import { getDynamicCssVariables } from "metabase/embedding-sdk/theme/dynamic-css-vars";
import { SDK_TO_MAIN_APP_COLORS_MAPPING } from "metabase/embedding-sdk/theme/embedding-color-palette";
import type { MantineTheme } from "metabase/ui";
import { SEMANTIC_COLOR_SCHEMES } from "metabase/ui/utils/color-schemes";

/**
 * Defines the CSS variables used across Metabase.
 */
export function getMetabaseCssVariables(theme: MantineTheme) {
  const colorScheme = theme.other?.colorScheme || "light";

  return css`
    :root {
      --mb-default-font-family: "${theme.fontFamily}";
      --mb-default-monospace-font-family: ${theme.fontFamilyMonospace};

      /* Semantic colors - theme aware */
      ${Object.entries(SEMANTIC_COLOR_SCHEMES)
        .map(([colorName, colors]) => {
          const colorValue = (colors as any)[colorScheme] || colors.light;
          return `--mb-color-${colorName}: ${colorValue};`;
        })
        .join('\n      ')}

      ${getThemeSpecificCssVariables(theme)}
      ${getDynamicCssVariables(theme)}
    }
  `;
}

export function getMetabaseSdkCssVariables(theme: MantineTheme, font: string) {
  return css`
    :root {
      --mb-default-font-family: ${font};
      ${getSdkDesignSystemCssVariables(theme)}
      ${getDynamicCssVariables(theme)}
      ${getThemeSpecificCssVariables(theme)}
    }
  `;
}

/**
 * Design System CSS variables.
 * These CSS variables are part of the core design system colors.
 *
 * Only keep colors that depend on the theme and are not specified anywhere else here.
 * You don't need to add new colors from `colors.module.css` here since they'll already
 * be available globally at :root
 **/
function getSdkDesignSystemCssVariables(theme: MantineTheme) {
  return css`
    /* Semantic colors */
    /* Dynamic colors from SDK */
    ${Object.entries(SDK_TO_MAIN_APP_COLORS_MAPPING).flatMap(
      ([_key, metabaseColorNames]) => {
        return metabaseColorNames.map((metabaseColorName) => {
          /**
           * Prevent returning the primary color when color is not found,
           * so we could add a logic to fallback to the default color ourselves.
           *
           * We will only create CSS custom properties for colors that are defined
           * in the palette, and additional colors overridden by the SDK.
           *
           * @see SDK_TO_MAIN_APP_COLORS_MAPPING
           */
          const color = theme.fn.themeColor(metabaseColorName);
          const colorExist = color !== metabaseColorName;

          if (colorExist) {
            return `--mb-color-${metabaseColorName}: ${color};`;
          }
        });
      },
    )}
  `;
}

/**
 * Theming-specific CSS variables.
 *
 * These CSS variables are NOT part of the core design system colors.
 * Do NOT add them to [palette.ts] and [colors.ts].
 *
 * Keep in sync with [GlobalStyles.tsx].
 * Refer to DEFAULT_METABASE_COMPONENT_THEME for their defaults.
 **/
export const getThemeSpecificCssVariables = (theme: MantineTheme) => css`
  ${Object.entries(CSS_VARIABLES_TO_SDK_THEME_MAP)
    .map(([cssVar, themeKey]) => {
      const value = getIn(theme.other, themeKey.split("."));

      return value ? `${cssVar}: ${value};` : "";
    })
    .join("\n")}
`;
