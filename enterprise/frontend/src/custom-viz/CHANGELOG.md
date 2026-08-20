# `@metabase/custom-viz` changelog

This changelog covers the `@metabase/custom-viz` npm package — the API and CLI for building custom visualizations for Metabase. Changes to how Metabase itself hosts custom visualization plugins are covered by the [Metabase changelog](https://www.metabase.com/changelog).

## 2.0.0

### ⚠ BREAKING CHANGES

- `column` and `column_settings` are now reserved setting ids, contributed to every visualization by Metabase to power the built-in per-column formatting popover. Plugins that declared their own settings under these ids must rename them — the `Settings` type now rejects those keys with a type error ([#78128](https://github.com/metabase/metabase/pull/78128)).
- The top-level `colorScheme` visualization prop moved into the new `renderingContext` prop (see Features below). Read `props.renderingContext.colorScheme` instead of `props.colorScheme` ([#78429](https://github.com/metabase/metabase/pull/78429)).
- The module-level `measureText`, `measureTextWidth`, and `measureTextHeight` exports are removed. The functions were stubs that always returned zero-size measurements — for real ones, use `measureText` on the new `renderingContext` prop (see Features below) ([#78429](https://github.com/metabase/metabase/pull/78429)).

### Features

- Per-column formatting: visualization settings now include a `column` function that resolves a column's effective formatting settings — instance-wide defaults, the column's metadata settings, and the card-level settings from the column formatting popover, merged in that order. Pass its result to `formatValue` to render values the way the user configured them ([#78128](https://github.com/metabase/metabase/pull/78128)).
- New `renderingContext` visualization prop with host rendering helpers: `getColor` resolves a Metabase color name to its current theme value, `measureText` measures text the way Metabase renders it, returning `{ width, height }` from a single measurement (`style.family` defaults to the instance font), `fontFamily` exposes that font for styling your own markup, and `colorScheme` tells you whether Metabase is rendering in light or dark mode ([#78429](https://github.com/metabase/metabase/pull/78429)).
- New `@metabase/custom-viz pack` command packages a built visualization into an upload-ready `.tgz`. Scaffolded projects call it from their `build` script instead of carrying their own copy of the packaging script, so fixes to packaging and to the bundle size limits now come with a package upgrade. Pass `--dir` to pack a project in another directory.
- `@metabase/custom-viz pack` stamps the exact `@metabase/custom-viz` version into the packed manifest as `sdk.version`. Your source `metabase-plugin.json` is not modified. Metabase compares the stamp against the SDK versions it was tested with — a plugin outside that range (or outside its own `metabase.version` range) is never rejected; it uploads and runs normally, with a warning shown on the admin page.

### Bug Fixes

- `FormatValueOptions["date_style"]` now accepts `null`, matching the values Metabase actually passes ([#70306](https://github.com/metabase/metabase/pull/70306)).

### Migrate to the `pack` command

Projects scaffolded before 2.0.0 have their own `pack.mjs` at the project root. To switch to the CLI:

1. Update `@metabase/custom-viz` to 2.0.0 or newer.
2. Change the `build` script in `package.json` to:

   ```
   vite build && metabase-custom-viz pack
   ```

3. Delete `pack.mjs`.
4. Remove `tar-stream` and `@types/tar-stream` from `devDependencies`, then reinstall.

Run `npm run build` to confirm you still get a `<name>-<version>.tgz` at the project root.

## 1.0.5 (2026-07-23)

### Bug Fixes

- The `.gitignore` in scaffolded projects now ignores `dist/` and `*.tgz` ([#78355](https://github.com/metabase/metabase/pull/78355)).

### Documentation

- Updates to the scaffolded project's README ([#75332](https://github.com/metabase/metabase/pull/75332), [#78355](https://github.com/metabase/metabase/pull/78355)).

## 1.0.4 (2026-06-03)

### Features

- Custom React components as setting widgets: a setting definition's `widget` now accepts a `React.ComponentType` in addition to the built-in widget names, and `getProps` is typed to return the component's own props (minus the base props injected by the settings renderer) ([#73941](https://github.com/metabase/metabase/pull/73941)).

## 1.0.3 (2026-06-02)

### Bug Fixes

- **Security:** updated Vite in scaffolded projects from 8.0.0 to 8.0.16 to pick up upstream security fixes ([#75053](https://github.com/metabase/metabase/pull/75053)).

## 1.0.2 (2026-06-01)

### ⚠ BREAKING CHANGES

- Removed `getAssetUrl` from the visualization component props (`CreateCustomVisualizationProps`) — inline images and other static assets into your plugin code e.g. using base64 strings ([#74960](https://github.com/metabase/metabase/pull/74960)).

## 1.0.1 (2026-05-15)

### ⚠ BREAKING CHANGES

- Replaced `section?: string` with `getSection?: () => string` in setting definitions, so section labels can be localized at call time ([#74077](https://github.com/metabase/metabase/pull/74077)).

## 1.0.0 (2026-05-08)

- Initial stable release.
