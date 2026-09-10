// WARNING: This file is referenced by CssVarsDeclarationPlugin.
// If you move or rename it, update the path in css-vars-declaration-plugin.js.

import type { MetabaseComponentTheme } from "metabase/ui";

export const COMPONENT_THEME_CSS_VARIABLES = {
  "--mb-overlay-z-index": (theme) => theme.popover.zIndex,
  "--mb-color-bg-dashboard": (theme) => theme.dashboard.backgroundColor,
  "--mb-color-bg-dashboard-card": (theme) =>
    theme.dashboard.card.backgroundColor,
  "--mb-color-bg-question": (theme) => theme.question.backgroundColor,
  "--mb-color-bg-sdk-question-toolbar": (theme) =>
    theme.question.toolbar?.backgroundColor,
  "--mb-color-text-collection-browser-expand-button": (theme) =>
    theme.collectionBrowser.breadcrumbs.expandButton.textColor,
  "--mb-color-bg-collection-browser-expand-button": (theme) =>
    theme.collectionBrowser.breadcrumbs.expandButton.backgroundColor,
  "--mb-color-text-collection-browser-expand-button-hover": (theme) =>
    theme.collectionBrowser.breadcrumbs.expandButton.hoverTextColor,
  "--mb-color-bg-collection-browser-expand-button-hover": (theme) =>
    theme.collectionBrowser.breadcrumbs.expandButton.hoverBackgroundColor,
} satisfies Record<
  string,
  (theme: MetabaseComponentTheme) => string | number | undefined
>;
