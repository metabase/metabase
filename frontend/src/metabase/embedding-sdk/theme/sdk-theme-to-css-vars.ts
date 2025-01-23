import type { FlattenObjectKeys } from "../types/utils";

import type { MetabaseComponentTheme } from "./MetabaseTheme";

type MetabaseComponentThemeKey = FlattenObjectKeys<MetabaseComponentTheme>;
type CssVariableToThemeMap = Record<string, MetabaseComponentThemeKey>;

export const INTERACTIVE_QUESTION_THEME_OPTIONS = {
  // Toolbar (Default Layout)
  "--mb-color-bg-sdk-question-toolbar": "question.toolbar.backgroundColor",

  // Chart Type Selector
  "--mb-color-bg-sdk-chart-type-selector":
    "question.chartTypeSelector.backgroundColor",

  // Question Settings Button
  "--mb-color-bg-sdk-question-settings-button":
    "question.questionSettingsButton.backgroundColor",
} satisfies CssVariableToThemeMap;

// SDK > Interactive Question > Notebook Editor Button
export const NOTEBOOK_EDITOR_THEME_OPTIONS = {
  "--mb-color-border-sdk-editor-button": "question.editorButton.borderColor",

  // Inactive
  "--mb-color-icon-sdk-editor-button": "question.editorButton.iconColor",
  "--mb-color-bg-sdk-editor-button": "question.editorButton.backgroundColor",

  // Active
  "--mb-color-icon-sdk-editor-button-active":
    "question.editorButton.activeIconColor",
  "--mb-color-bg-sdk-editor-button-active":
    "question.editorButton.activeBackgroundColor",
} satisfies CssVariableToThemeMap;

// SDK > Collection Browser > Breadcrumbs > Expand Button
export const COLLECTION_BROWSER_THEME_OPTIONS = {
  "--mb-color-text-collection-browser-expand-button":
    "collectionBrowser.breadcrumbs.expandButton.textColor",
  "--mb-color-bg-collection-browser-expand-button":
    "collectionBrowser.breadcrumbs.expandButton.backgroundColor",
  "--mb-color-text-collection-browser-expand-button-hover":
    "collectionBrowser.breadcrumbs.expandButton.hoverTextColor",
  "--mb-color-bg-collection-browser-expand-button-hover":
    "collectionBrowser.breadcrumbs.expandButton.hoverBackgroundColor",
} satisfies CssVariableToThemeMap;

/**
 * Maps the CSS variable name to the corresponding theme key in the Embedding SDK theme.
 *
 * In the main app, they will be mapped to the default theme values in [default-component-theme.ts].
 * In the Embedding SDK, they can be customized via the `theme` prop in MetabaseProvider.
 **/
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
  "--mb-color-notebook-step-bg": "question.editor.actionButton.backgroundColor",

  // Mappings for SDK elements
  ...INTERACTIVE_QUESTION_THEME_OPTIONS,
  ...NOTEBOOK_EDITOR_THEME_OPTIONS,
  ...COLLECTION_BROWSER_THEME_OPTIONS,
} satisfies CssVariableToThemeMap;
