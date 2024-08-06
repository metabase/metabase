import { css } from "@emotion/react";
import { get } from "lodash";

import type { MetabaseComponentTheme } from "embedding-sdk";
import { color } from "metabase/lib/colors";
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
      ${getDesignSystemCssVariables(theme)}
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
function getDesignSystemCssVariables(theme: MantineTheme) {
  return css`
    --mb-default-font-family: "${theme.fontFamily}";

    --mb-color-bg-light: ${theme.fn.themeColor("bg-light")};
    --mb-color-bg-dark: ${theme.fn.themeColor("bg-dark")};
    --mb-color-brand: ${theme.fn.themeColor("brand")};

    --mb-color-brand-light: color-mix(in srgb, var(--mb-color-brand) 4%, #fff);
    --mb-color-brand-lighter: color-mix(
      in srgb,
      var(--mb-color-brand) 10%,
      #fff
    );
    --mb-color-brand-alpha-04: color-mix(
      in srgb,
      var(--mb-color-brand) 4%,
      transparent
    );
    --mb-color-brand-alpha-88: color-mix(
      in srgb,
      var(--mb-color-brand) 88%,
      transparent
    );
    --mb-color-border-alpha-30: color-mix(
      in srgb,
      var(--mb-color-border) 30%,
      transparent
    );
    --mb-color-text-white-alpha-85: color-mix(
      in srgb,
      var(--mb-color-text-white) 85%,
      transparent
    );
    --mb-color-bg-black-alpha-60: color-mix(
      in srgb,
      var(--mb-color-bg-black) 60%,
      transparent
    );
    --mb-color-bg-white-alpha-15: color-mix(
      in srgb,
      var(--mb-color-bg-white) 15%,
      transparent
    );

    /* Semantic colors */
    --mb-color-focus: ${theme.fn.themeColor("focus")};
    --mb-color-bg-white: ${theme.fn.themeColor("bg-white")};
    --mb-color-bg-black: ${theme.fn.themeColor("bg-black")};
    --mb-color-shadow: ${theme.fn.themeColor("shadow")};
    --mb-color-border: ${theme.fn.themeColor("border")};
    --mb-color-text-dark: ${theme.fn.themeColor("text-dark")};
    --mb-color-text-medium: ${theme.fn.themeColor("text-medium")};
    --mb-color-text-light: ${theme.fn.themeColor("text-light")};
    --mb-color-danger: ${theme.fn.themeColor("danger")};
    --mb-color-error: ${theme.fn.themeColor("error")};
    --mb-color-filter: ${theme.fn.themeColor("filter")};
    --mb-color-bg-error: ${color("bg-error")};
    --mb-color-bg-medium: ${theme.fn.themeColor("bg-medium")};
    --mb-color-bg-night: ${color("bg-night")};
    --mb-color-text-white: ${theme.fn.themeColor("text-white")};
    --mb-color-success: ${theme.fn.themeColor("success")};
    --mb-color-summarize: ${theme.fn.themeColor("summarize")};
    --mb-color-warning: ${theme.fn.themeColor("warning")};
  `;
}

/**
 * Theming-specific CSS variables.
 *
 * These CSS variables are NOT part of the core design system colors.
 * Do NOT add them to [palette.ts] and [colors.ts].
 *
 * Keep in sync with [GlobalStyles.tsx] and [.storybook/preview-head.html].
 * Refer to DEFAULT_METABASE_COMPONENT_THEME for their defaults.
 **/
export function getThemeSpecificCssVariables(theme: MantineTheme) {
  // Get value from theme.other, which is typed as MetabaseComponentTheme
  const getValue = (key: MetabaseComponentThemeKey) => get(theme.other, key);

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
