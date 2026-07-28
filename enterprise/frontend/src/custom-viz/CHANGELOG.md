# `@metabase/custom-viz` changelog

This changelog covers the `@metabase/custom-viz` npm package — the API and CLI for building custom visualizations for Metabase. Changes to how Metabase itself hosts custom visualization plugins are covered by the [Metabase changelog](https://www.metabase.com/changelog).

## 1.0.5 (2026-07-23)

### Bug Fixes

- the `.gitignore` in scaffolded projects now ignores `dist/` and `*.tgz` ([#78355](https://github.com/metabase/metabase/pull/78355))

### Documentation

- updates to the scaffolded project's README ([#75332](https://github.com/metabase/metabase/pull/75332), [#78355](https://github.com/metabase/metabase/pull/78355))

## 1.0.4 (2026-06-03)

### Features

- custom React components as setting widgets: a setting definition's `widget` now accepts a `React.ComponentType` in addition to the built-in widget names, and `getProps` is typed to return the component's own props (minus the base props injected by the settings renderer) ([#73941](https://github.com/metabase/metabase/pull/73941))

## 1.0.3 (2026-06-02)

### Bug Fixes

- **security:** updated Vite in scaffolded projects from 8.0.0 to 8.0.16 to pick up upstream security fixes ([#75053](https://github.com/metabase/metabase/pull/75053))

## 1.0.2 (2026-06-01)

### ⚠ BREAKING CHANGES

- removed `getAssetUrl` from the visualization component props (`CreateCustomVisualizationProps`) — inline images and other static assets into your plugin code e.g. using base64 strings ([#74960](https://github.com/metabase/metabase/pull/74960))

## 1.0.1 (2026-05-15)

### ⚠ BREAKING CHANGES

- replaced `section?: string` with `getSection?: () => string` in setting definitions, so section labels can be localized at call time ([#74077](https://github.com/metabase/metabase/pull/74077))

## 1.0.0 (2026-05-08)

- initial stable release
