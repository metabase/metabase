// WARNING: This file is referenced by CssVarsDeclarationPlugin.
// If you move or rename it, update the path in css-vars-declaration-plugin.js.

// eslint-disable-next-line no-restricted-imports
import { type SerializedStyles, css } from "@emotion/react";

import type { MantineTheme } from "metabase/ui";
import { deriveFullMetabaseTheme } from "metabase/ui/colors";
import type { ResolvedColorScheme } from "metabase/utils/color-scheme";
import { getFontFamilyValue } from "metabase/utils/fonts";
import type { ColorSettings } from "metabase-types/api";

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
  themeCssVariables,
}: {
  theme: MantineTheme;
  whitelabelColors?: ColorSettings | null;
  themeCssVariables?: SerializedStyles;
}) {
  const colorScheme = theme.other?.colorScheme || "light";

  return css`
    :root {
      --mb-default-monospace-font-family: ${theme.fontFamilyMonospace};

      /* Semantic colors */
      ${getPaletteCssVariables(colorScheme, whitelabelColors)}
      ${themeCssVariables}
    }
  `;
}
