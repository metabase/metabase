# @metabase/ui

Metabase's UI components, theme, colors and icons, built from [`frontend/src/metabase/ui`](../src/metabase/ui). For Metabase's own products; it isn't supported for other use. The license is in `LICENSE.txt`.

## Install

```sh
npm install @metabase/ui react react-dom dayjs @mantine/core@~8.3.18 @mantine/hooks@~8.3.18 @mantine/dates@~8.3.18
```

Peer dependencies: `react` and `react-dom` `^19.0.0`, `dayjs` `^1.11.18`, and `@mantine/core`, `@mantine/hooks`, `@mantine/dates` `~8.3.18` (`styles.css` embeds that Mantine version's CSS). Peer warnings from `kbar` and its dependencies are expected.

## Use

```tsx
import "@metabase/ui/styles.css"; // baseline, Mantine core and dates, then Metabase's styles
import "@metabase/ui/fonts.css"; // optional: Lato
import { Button, MetabaseUIProvider } from "@metabase/ui";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <MetabaseUIProvider colorScheme="dark">
    <Button variant="filled">Save</Button>
  </MetabaseUIProvider>,
);
```

Do not also import `@mantine/core/styles.css` or `@mantine/dates/styles.css`.

The provider sets up the theme, the color variables, the font variable and what overlays (modals, tooltips, popovers) need. Wrap your app in it once.

| Prop          | Type                   | Default                     |
| ------------- | ---------------------- | --------------------------- |
| `colorScheme` | `"light"` \| `"dark"`  | `"light"`                   |
| `fontFamily`  | `string` (CSS value)   | `"Lato", Arial, sans-serif` |
| `theme`       | `MantineThemeOverride` | none                        |

`theme` extends Metabase's Mantine theme. `fontFamily`, `colors` and `other.colorScheme` in `theme` are ignored; use the props above. Other keys, such as `components`, `headings`, `fontFamilyMonospace` and `primaryColor`, can still be overridden. `fonts.css` doesn't include the default monospace font.

### Colors

Color names are the ones in Metabase's theme, such as `core-brand` and `text-primary`:

```tsx
<Text c="core-brand" />
<div style={{ color: color("core-brand") }} /> // import { color } from "@metabase/ui"
<div style={{ color: "var(--mb-color-core-brand)" }} />
```

### Limits in 0.1.0

- Browser only; no server-side rendering.
- One provider per page.
- The stylesheet and the provider affect the whole page: the variables are set on `:root`; the baseline sets `box-sizing` on every element, makes form controls inherit the font, and sets the font and colors on `body`; Mantine sets `data-mantine-color-scheme` on `<html>`.
- The color scheme is controlled only by the `colorScheme` prop. `useColorScheme()` reports it, and its setters do nothing.
- No CSP nonce support.
- No custom color palette.
- Not tested next to the Metabase embedding SDK.

The types include Metabase's Mantine augmentation; importing `@metabase/ui` is enough.

## Build

From the repository root: `bun run build-ui-package` builds `dist/`, and `bun run smoke-ui-package` packs the archive, installs it into a fresh app in a temp directory, builds that app and runs its Playwright tests in Chromium. Flags: `bun run smoke-ui-package -- --no-browser` skips the browser tests, `-- --release-only` runs only the `@release` ones, `-- --with-deps` also installs the system libraries Chromium needs on Linux (it uses `sudo`; the release workflow passes it), and `-- --keep` keeps the temp directory. `--with-deps` has no effect with `--no-browser`.

## Releasing

1. In a normal PR, bump `version` in `package.json` and add a `CHANGELOG.md` entry.
2. In `0.x`, a minor release may break compatibility; a patch must not. Any Mantine upgrade in Metabase is a minor release.
3. `X.Y.Z` publishes to the `latest` dist-tag and `X.Y.Z-canary.N` to `canary`. No other version shape is accepted.
4. Run the "Release UI Package" workflow from `master`; it refuses other refs. Run it first with `dry_run` on (the default), then again with it off.

A dry run resolves the version, checks that the `ui-v<version>` tag and the npm version don't exist yet, builds the package, and smoke-tests the packed archive in Chromium. It doesn't prove that npm authentication works, so the first real run can still fail at the publish step.

The tested archive is uploaded as the `metabase-ui-<version>-<sha7>` artifact, also on dry runs, and kept for 90 days. A real run builds and tests again, publishes the archive its own smoke job tested, then pushes the `ui-v<version>` tag on the released commit. It doesn't reuse an earlier dry run's archive.

If the publish succeeds but the tag push fails, use **Re-run failed jobs** on that run, which only repeats the tag step, or push the tag by hand. **Re-run all jobs** would stop at the npm version check.

### Manual first publish

If the workflow can't publish yet (for example, npm trusted publishing isn't set up), download the artifact from a green dry run on the commit you're releasing, unzip it to get the `.tgz` file, publish that file with `npm publish <file> --tag <dist-tag> --access public` without rebuilding, then push the `ui-v<version>` tag on that commit by hand. Don't run the workflow for that version again.
