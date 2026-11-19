# @metabase/ui

Metabase's UI components, theme, colors and icons, built from [`frontend/src/metabase/ui`](../src/metabase/ui). For Metabase's own products; it isn't supported for other use. The license is in `LICENSE.txt`.

## Install

```sh
npm install @metabase/ui
```

Peer dependencies: `react` and `react-dom` `^19.0.0`, `dayjs` `^1.11.18`, and `@mantine/core`, `@mantine/hooks`, `@mantine/dates` `~8.3.18` (`styles.css` embeds that Mantine version's CSS). Peer warnings from `kbar` and its dependencies are expected.

```tsx
import "@metabase/ui/styles.css"; // baseline, Mantine core and dates, then Metabase's styles
import "@metabase/ui/fonts.css"; // optional: Lato
```

Do not also import Mantine's own CSS. A standalone provider arrives in a later change.

The types include Metabase's Mantine augmentation; importing `@metabase/ui` is enough.

## Build

From the repository root: `bun run build-ui-package` builds `dist/`, and `bun run smoke-ui-package` packs the archive and installs it into a fresh app in a temp directory.
