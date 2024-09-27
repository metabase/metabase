import { css } from "@emotion/react";
import { getIn } from "icepick";

import type { MetabaseComponentTheme } from "embedding-sdk";
import { SDK_TO_MAIN_APP_COLORS_MAPPING } from "embedding-sdk/lib/theme/embedding-color-palette";
import type { MantineTheme } from "metabase/ui";

// https://www.raygesualdo.com/posts/flattening-object-keys-with-typescript-types/
type FlattenObjectKeys<
  T extends Record<string, unknown>,
  Key = keyof T,
> = Key extends string
  ? T[Key] extends Record<string, unknown>
    ? `${Key}.${FlattenObjectKeys<T[Key]>}`
    : `${Key}`
  : never;

type MetabaseComponentThemeKey = FlattenObjectKeys<MetabaseComponentTheme>;

/**
 * Defines the CSS variables used across Metabase.
 */
export function getMetabaseCssVariables(theme: MantineTheme) {
  return css`
    :root {
      --mb-default-font-family: "${theme.fontFamily}";

      /* Semantic colors */
      --mb-color-brand: ${theme.colors.brand[0]};
      --mb-color-summarize: ${theme.colors.summarize[0]};
      --mb-color-filter: ${theme.colors.summarize[0]};
      ${getThemeSpecificCssVariables(theme)}
    }
  `;
}

export function getMetabaseSdkCssVariables(theme: MantineTheme, font: string) {
  return css`
    :root {
      --mb-default-font-family: ${font};
      ${getSdkDesignSystemCssVariables(theme)}
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
      ([_, metabaseColorNames]) => {
        return metabaseColorNames.map(metabaseColorName => {
          /**
           * Prevent returning the primary color when color is not found,
           * so we could add a logic to fallback to the default color ourselves.
           *
           * We will only create CSS custom properties for colors that are defined
           * in the palette, and additional colors overridden by the SDK.
           *
           * @see SDK_TO_MAIN_APP_COLORS_MAPPING
           */
          const color = theme.fn.themeColor(
            metabaseColorName,
            undefined,
            false,
          );
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
export function getThemeSpecificCssVariables(theme: MantineTheme) {
  // Get value from theme.other, which is typed as MetabaseComponentTheme
  const getValue = (key: MetabaseComponentThemeKey): string | undefined => {
    return getIn(theme.other, key.split("."));
  };

  return css`
    --mb-color-bg-dashboard: ${getValue("dashboard.backgroundColor")};
    --mb-color-bg-dashboard-card: ${getValue("dashboard.card.backgroundColor")};
    --mb-color-bg-question: ${getValue("question.backgroundColor")};

    --mb-color-text-collection-browser-expand-button: ${getValue(
      "collectionBrowser.breadcrumbs.expandButton.textColor",
    )};
    --mb-color-bg-collection-browser-expand-button: ${getValue(
      "collectionBrowser.breadcrumbs.expandButton.backgroundColor",
    )};
    --mb-color-text-collection-browser-expand-button-hover: ${getValue(
      "collectionBrowser.breadcrumbs.expandButton.hoverTextColor",
    )};
    --mb-color-bg-collection-browser-expand-button-hover: ${getValue(
      "collectionBrowser.breadcrumbs.expandButton.hoverBackgroundColor",
    )};
  `;
}
