// WARNING: This file is referenced by CssVarsDeclarationPlugin.
// If you move or rename it, update the path in css-vars-declaration-plugin.js.

// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";

import type { MantineTheme } from "metabase/ui";
import { deriveFullMetabaseTheme } from "metabase/ui";
import type { ResolvedColorScheme } from "metabase/utils/color-scheme";
import { getFontFamilyValue } from "metabase/utils/fonts";
import type { ColorSettings } from "metabase-types/api";

import { COMPONENT_THEME_CSS_VARIABLES } from "./component-theme-css-variables";
import { getDynamicCssVariables } from "./dynamic-css-vars";

export const getPaletteCssVariables = (
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

export const getDefaultFontFamilyCssVariable = (font: string): string =>
  `--mb-default-font-family: ${getFontFamilyValue(font)};`;

/**
 * Defines the CSS variables used across Metabase.
 */
export function getMetabaseCssVariables({
  theme,
  whitelabelColors,
}: {
  theme: Pick<MantineTheme, "fn" | "other" | "fontFamilyMonospace">;
  whitelabelColors?: ColorSettings | null;
}) {
  const colorScheme = theme.other.colorScheme || "light";

  return css`
    :root {
      --mb-default-monospace-font-family: ${theme.fontFamilyMonospace};

      /* Semantic colors */
      ${getPaletteCssVariables(colorScheme, whitelabelColors)}
      ${getThemeSpecificCssVariables(theme)}
      ${getDynamicCssVariables(theme)}
    }
  `;
}

export const getThemeSpecificCssVariables = (
  theme: Pick<MantineTheme, "other">,
) => css`
  ${Object.entries(COMPONENT_THEME_CSS_VARIABLES)
    .map(([cssVar, getValue]) => {
      const value = getValue(theme.other);
      return value != null && value !== "" ? `${cssVar}: ${value};` : "";
    })
    .join("\n")}
`;
