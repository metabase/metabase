// Ambient stubs for `custom-viz/src/*` imports in the main Metabase repo.
//
// The `@metabase/custom-viz` package lives under
// `enterprise/frontend/src/custom-viz`. It has its own `tsconfig.json`,
// `node_modules` (including a different React major version), and is meant to
// be type-checked independently — not as part of the main app's `tsc` pass.
//
// These stubs are only used by the main repo's tsconfig (via `paths`), so they
// do NOT affect the package's own build or scaffolded consumer projects, which
// resolve typings from the published `dist/*.d.ts`.

/* eslint-disable @typescript-eslint/no-explicit-any */

export type CreateCustomVisualization<TSettings = unknown> = any;

export type CreateCustomVisualizationProps<TSettings = unknown> = {
  defineSetting: (definition: any) => any;
  getAssetUrl: (assetPath: string) => string;
  locale: string;
};

export type CustomVisualization<TSettings = unknown> = any;

export type CustomVisualizationSettingDefinition<TSettings = unknown> = any;

export type ColumnTypes = any;
