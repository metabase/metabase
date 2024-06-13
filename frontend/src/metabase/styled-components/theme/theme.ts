import { get } from "underscore";

import type { MetabaseComponentTheme } from "embedding-sdk";
import { useMantineTheme } from "metabase/ui";

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

/*
  Theming-specific CSS variables.
  These CSS variables are not part of the core design system colors.
**/
export const useThemeSpecificSelectors = () => {
  const theme = useMantineTheme();

  //  get value from theme.other, which is typed as MetabaseComponentTheme
  const getValue = (key: MetabaseComponentThemeKey) => get(theme.other, key);

  return `
    --mb-color-bg-dashboard: ${getValue("dashboard.backgroundColor")}
    --mb-color-bg-dashboard-card: ${getValue("dashboard.card.backgroundColor")};
    --mb-color-bg-question: ${getValue("question.backgroundColor")};

    --mb-color-bg-collection-browser-expand-button: ${getValue(
      "collectionBrowser.breadcrumbs.expandButton.backgroundColor",
    )};
    --mb-color-text-collection-browser-expand-button: ${getValue(
      "collectionBrowser.breadcrumbs.expandButton.textColor",
    )};
    --mb-color-bg-collection-browser-expand-button-hover: ${getValue(
      "collectionBrowser.breadcrumbs.expandButton.hoverBackgroundColor",
    )};
    
    --mb-color-text-collection-browser-expand-button-hover: ${getValue(
      "collectionBrowser.breadcrumbs.expandButton.hoverBackgroundColor",
    )};
  `;
};
