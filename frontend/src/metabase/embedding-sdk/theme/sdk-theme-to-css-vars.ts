import type { FlattenObjectKeys } from "../types/utils";

import type { MetabaseComponentTheme } from "./MetabaseTheme";

type MetabaseComponentThemeKey = FlattenObjectKeys<MetabaseComponentTheme>;

/** Maps the CSS variable name to the corresponding theme key in the Embedding SDK theme. */
export const CSS_VARIABLES_TO_SDK_THEME_MAP = {
  // Overlays
  "--mb-overlay-z-index": "popover.zIndex",

  // Tooltips
  "--mb-color-tooltip-text": "tooltip.textColor",
  "--mb-color-tooltip-background": "tooltip.backgroundColor",
  "--mb-color-tooltip-background-focused": "tooltip.focusedBackgroundColor",
  "--mb-color-tooltip-text-secondary": "tooltip.secondaryTextColor",

  // Dashboards
  "--mb-color-bg-dashboard": "dashboard.backgroundColor",
  "--mb-color-bg-dashboard-card": "dashboard.card.backgroundColor",

  // Questions
  "--mb-color-bg-question": "question.backgroundColor",

  // Notebook Editor > Action Button
  "--mb-color-notebook-step-bg": "questionEditor.actionButton.backgroundColor",

  // Embedding SDK > Interactive Question > Toolbar (Default Layout)
  "--mb-color-bg-sdk-question-toolbar": "question.toolbar.backgroundColor",

  // Embedding SDK > Interactive Question > Notebook Editor Button
  "--mb-color-bg-sdk-editor-button":
    "questionEditor.editorButton.backgroundColor",
  "--mb-color-bg-sdk-editor-button-active":
    "questionEditor.editorButton.activeBackgroundColor",
  "--mb-color-icon-sdk-editor-button": "questionEditor.editorButton.iconColor",
  "--mb-color-icon-sdk-editor-button-active":
    "questionEditor.editorButton.activeIconColor",
  "--mb-color-border-sdk-editor-button":
    "questionEditor.editorButton.borderColor",

  // Embedding SDK > Collection Browser
  "--mb-color-text-collection-browser-expand-button":
    "collectionBrowser.breadcrumbs.expandButton.textColor",
  "--mb-color-bg-collection-browser-expand-button":
    "collectionBrowser.breadcrumbs.expandButton.backgroundColor",
  "--mb-color-text-collection-browser-expand-button-hover":
    "collectionBrowser.breadcrumbs.expandButton.hoverTextColor",
  "--mb-color-bg-collection-browser-expand-button-hover":
    "collectionBrowser.breadcrumbs.expandButton.hoverBackgroundColor",
} satisfies Record<string, MetabaseComponentThemeKey>;
