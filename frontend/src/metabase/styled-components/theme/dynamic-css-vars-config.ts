// WARNING: This file is referenced by CssVarsDeclarationPlugin.
// If you move or rename it, update the path in css-vars-declaration-plugin.js.

import type { ColorName } from "metabase/ui";

export type ColorOperation = {
  lighten?: number;
  darken?: number;
  alpha?: number;
};

type DynamicColorDefinition = {
  source: ColorName;
} & ColorOperation;

type DynamicCssVarConfig = Record<
  string,
  {
    light?: DynamicColorDefinition;
    dark?: DynamicColorDefinition;
  }
>;

/**
 * Component colors derived from the resolved palette.
 */
export const DYNAMIC_CSS_VARIABLES: DynamicCssVarConfig = {
  "--mb-color-bg-sdk-question-toolbar": {
    light: { source: "background-primary", darken: 0.04 },
    dark: { source: "background-primary", lighten: 0.5 },
  },
  "--mb-color-notebook-step-bg": {
    light: { source: "background-primary", darken: 0.05 },
    dark: { source: "background-primary", lighten: 0.5 },
  },
  "--mb-color-notebook-step-bg-hover": {
    light: { source: "background-primary", darken: 0.1 },
    dark: { source: "background-primary", lighten: 0.4 },
  },
  "--mb-color-cartesian-grid-line": {
    light: { source: "border", alpha: 0.5 },
    dark: { source: "border" },
  },
  "--mb-color-table-border": {
    light: { source: "border", alpha: 0.5 },
    dark: { source: "border", alpha: 0.15 },
  },
};
