// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
import { getIn } from "icepick";

import { CSS_VARIABLES_TO_SDK_THEME_MAP } from "metabase/embedding-sdk/theme/css-vars-to-sdk-theme";
import { getDynamicCssVariables } from "metabase/embedding-sdk/theme/dynamic-css-vars";
import {
  SDK_TO_MAIN_APP_COLORS_MAPPING,
  SDK_TO_MAIN_APP_TOOLTIP_COLORS_MAPPING,
  SDK_UNCHANGEABLE_COLORS,
} from "metabase/embedding-sdk/theme/embedding-color-palette";
import type { ResolvedColorScheme } from "metabase/lib/color-scheme";
import { deriveFullMetabaseTheme } from "metabase/lib/colors";
import type { ColorName } from "metabase/lib/colors/types";
import type { MantineTheme } from "metabase/ui";
import type { ColorSettings } from "metabase-types/api";

const createColorVars = (
  colorScheme: ResolvedColorScheme,
  whitelabelColors?: ColorSettings | null,
): string => {
  const theme = deriveFullMetabaseTheme({
    colorScheme,
    whitelabelColors,
  });

  return Object.entries(theme.colors)
    .map(([name, value]) => `--mb-color-${name}: ${value};`)
    .join("\n");
};

/**
 * Defines the CSS variables used across Metabase.
 */
export function getMetabaseCssVariables({
  theme,
  whitelabelColors,
}: {
  theme: MantineTheme;
  whitelabelColors?: ColorSettings | null;
}) {
  const colorScheme = theme.other?.colorScheme || "light";

  return css`
    :root {
      --mb-default-monospace-font-family: ${theme.fontFamilyMonospace};

      /* Semantic colors */
      ${createColorVars(colorScheme, whitelabelColors)}
      ${getThemeSpecificCssVariables(theme)}
      ${getDynamicCssVariables(theme)}
    }
  `;
}

export function getMetabaseSdkCssVariables({
  theme,
  font,
  whitelabelColors,
}: {
  theme: MantineTheme;
  font: string;
  whitelabelColors?: ColorSettings | null;
}) {
  return css`
    :root {
      --mb-default-font-family: ${font};
      ${createColorVars("light", whitelabelColors)}
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
 * You don't need to add new colors from `frontend/src/metabase/lib/colors/colors.ts` here since
 * they're already included in `getMetabaseSdkCssVariables`
 **/
function getSdkDesignSystemCssVariables(theme: MantineTheme) {
  const createSdkColorVars = (colorName: ColorName) => {
    /**
     * Prevent returning the primary color when color is not found,
     * so we could add a logic to fallback to the default color ourselves.
     *
     * We will only create CSS custom properties for colors that are defined
     * in the palette, and additional colors overridden by the SDK.
     */
    const color = theme.fn.themeColor(colorName);
    const colorExist = color !== colorName;
    if (colorExist) {
      return `--mb-color-${colorName}: ${color};`;
    }
  };
  return css`
    /* SDK colors defined via theme.colors */
    ${Object.entries(SDK_TO_MAIN_APP_COLORS_MAPPING).flatMap(([, colorNames]) =>
      colorNames.map(createSdkColorVars),
    )}

    /* SDK tooltip colors defined via theme.components.tooltip */
    ${Object.entries(SDK_TO_MAIN_APP_TOOLTIP_COLORS_MAPPING).flatMap(
      ([, colorName]) => createSdkColorVars(colorName),
    )}

    /* Colors that cannot be changed. */
    ${SDK_UNCHANGEABLE_COLORS.map((colorName) => createSdkColorVars(colorName))}
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
