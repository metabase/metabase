# @metabase/ui

Metabase's UI components, theme, colours and icons, published from [`frontend/src/metabase/ui`](../src/metabase/ui).

> This package is for Metabase's own products. It is not supported for external use, and its licence (see `LICENSE.txt`) does not grant use to anyone outside Metabase.

The source stays in `frontend/src/metabase/ui`. This folder only holds the package configuration: a Vite library build, the type declarations build, the API report and the checks.

## Install and use

```sh
bun add @metabase/ui
```

Peer dependencies: `react` and `react-dom` 19, `@mantine/core`, `@mantine/dates` and `@mantine/hooks` `~8.3.18` (the same minor, because `styles.css` embeds that Mantine version's CSS), `dayjs`. Add `@types/react` for TypeScript.

Temporary dependencies: `@emotion/react` and `@emotion/cache` are installed with the package because Metabase's app still uses Emotion; they are removed when Emotion leaves the main app.

```tsx
import "@metabase/ui/styles.css"; // Mantine core and dates styles, then Metabase's
import "@metabase/ui/fonts.css"; // optional: Lato

import { Button, MetabaseUIProvider } from "@metabase/ui";

export const App = () => (
  <MetabaseUIProvider colorScheme="light">
    <Button variant="filled">Hello</Button>
  </MetabaseUIProvider>
);
```

The types include Metabase's Mantine augmentation (colour names, spacing, radius and shadow keys) with no extra import.

`styles.css` already contains Mantine's core and dates styles and Mantine's baseline, so do NOT also import `@mantine/core/styles.css` or `@mantine/dates/styles.css`.

The baseline sets global `body` (margin, font, colours), `box-sizing` and form-control `font` rules, as Mantine's own stylesheet does.

## `MetabaseUIProvider` props

Wrap the app once, below your React root.

| Prop                       | Type                              | Default                                | Notes                                                          |
| -------------------------- | --------------------------------- | -------------------------------------- | -------------------------------------------------------------- |
| `colorScheme`              | `"light" \| "dark"`               | `"light"`                              | Does not follow the OS setting                                 |
| `fontFamily`               | `string`                          | `'"Lato", Arial, sans-serif'`          | CSS `font-family` value, written to `--mb-default-font-family` |
| `theme`                    | `MantineThemeOverride`            | none                                   | Merged over Metabase's theme                                   |
| `cssVariablesSelector`     | `string`                          | `":root"`                              | Element that receives the CSS variables                        |
| `nonce`                    | `string`                          | `get-nonce`'s nonce, else `"metabase"` | Applied to Mantine's `<style>` tags                            |
| `whitelabelColors`         | `ColorSettings \| null`           | none                                   | Application colour overrides                                   |
| `onUpdateWhitelabelColors` | `(colors: ColorSettings) => void` | none                                   | Called when a component asks to change the whitelabel colours  |

## Browser only

Some modules read `window` and `navigator` when they are imported. There is no server-side rendering support, and Jest tests need a DOM environment (`jsdom`).

## TypeScript

The package augments `@mantine/core`'s types. Colour props accept Metabase colour names (`core-brand`, `brand`, ...) and reject Mantine's stock names such as `grape`. This needs `"moduleResolution": "bundler"` and `@types/react`.

If `skipLibCheck` is `false` and your `lib` does not include ES2025 or `ESNext`, add `"ESNext.Collection"` to `lib`: `@mantine/hooks` declares `ReadonlySetLike`, which is only defined by that lib (TypeScript 5.5 or later). `host-app/tsconfig.json` shows a working setup.

## Build and check locally

From the repository root:

```sh
bun run build-ui-package   # dist/: ESM JS, .d.ts, styles.css, fonts.css
bun run check-ui-package   # build + versions + dist + API report
```

From this folder:

| Script                           | What it does                                                                                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run build`                  | Vite build, then declarations                                                                                                                                          |
| `bun run type-check`             | Type-checks the entry and `/ui` without the app's path mapping                                                                                                         |
| `bun run check:dist`             | No forbidden `.d.ts` specifiers, undeclared or unused dependencies, CSS imports, or side-effect modules missing from `sideEffects`; every `--mb-*` variable is defined |
| `bun run check:package-versions` | Dependency ranges match the root `package.json`                                                                                                                        |
| `bun run api:check`              | Fails when `api/ui.api.md` is out of date                                                                                                                              |
| `bun run api:update`             | Rewrites `api/ui.api.md`                                                                                                                                               |
| `bun run pack`                   | Builds and runs `npm pack` into `.pack/` (never publishes)                                                                                                             |
| `bun run test:host-app`          | Packs, installs the tarball into `host-app/`, type-checks, builds with Vite and rspack, runs the Playwright test (`host-app:*` scripts run single stages)              |

## API changes

Everything exported from `src/index.ts` is a semver commitment. `api/ui.api.md` is an api-extractor report of the built declarations. When a change touches the public API, run `bun run api:update` and commit the diff so reviewers see it.

## Notes

- `/ui` imports itself as `metabase/ui` and `metabase/ui/...`. The build aliases only that prefix (Vite alias, tsconfig `paths`), rejects any other app import, and rewrites the specifiers to relative paths in the emitted `.d.ts` files.
- CSS-module class names are prefixed `mbui-` so they cannot collide with the app's or the embedding SDK's.
- `*.svg?component` icons are compiled with the same SVGR and svgo options as `rspack.main.config.js`.
- For a strict CSP, pass `nonce` to `MetabaseUIProvider`. Without it, Mantine's `<style>` tags get the placeholder `nonce="metabase"` (unless `get-nonce`'s `setNonce` or `__webpack_nonce__` provides one), which a real CSP rejects.
- `sideEffects` in `package.json` lists `register-popover-dropdown.js`, which installs Metabase's popover dropdown on Mantine's `Popover`. Keep it listed, or bundlers drop the module and every Select/Menu loses its overlay stacking.
- The provider writes every `--mb-*` variable the package reads and does not declare in `styles.css` (`--mb-color-*`, fonts, `--mb-overlay-z-index`). `check:dist` enforces this.

## Not part of the stable API

`src/index.ts` re-exports the whole `/ui` barrel, so some internals are importable but may change or disappear in any release, without a semver bump:

- Theme pieces: every `*Overrides` export (for example `buttonOverrides`, `menuOverrides`) and other theme-building helpers.
- Modal internals: `useModalOpenEffect`, `ModalOpenEffectContext`, `ModalOpenEffectProvider`.
- `colorSchemeContextDefaultValue`, `PreventEagerPortal`, `PORTAL_CONTAINER_ID`.

Treat components, `MetabaseUIProvider`, the colour helpers and the types as the supported surface.
