# @metabase/ui

Metabase's UI components, theme, colors and icons, built from [`frontend/src/metabase/ui`](../src/metabase/ui). For Metabase's own products; it isn't supported for other use. The license is in `LICENSE.txt`.

## Install

```sh
bun add @metabase/ui react react-dom dayjs @mantine/core@~8.3.18 @mantine/hooks@~8.3.18 @mantine/dates@~8.3.18
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

| Prop          | Type                               | Default                     |
| ------------- | ---------------------------------- | --------------------------- |
| `colorScheme` | `"light"` \| `"dark"`              | `"light"`                   |
| `fontFamily`  | `string` (CSS value)               | `"Lato", Arial, sans-serif` |
| `theme`       | `MetabaseUIProviderProps["theme"]` | none                        |

`theme` extends Metabase's Mantine theme. The provider owns `fontFamily`, `colors`, `fn` and `other.colorScheme`; use the top-level props for font family and color scheme. The provider raises the default tooltip z-index above a custom `other.popover.zIndex` when needed. An explicit tooltip z-index takes precedence. Other keys, such as `components`, `headings`, `fontFamilyMonospace` and `primaryColor`, can still be overridden. `fonts.css` doesn't include the default monospace font.

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

For a change that affects consumers of `@metabase/ui`, add a changeset to your PR:

```sh
cd frontend/ui-package
mise exec -- bunx --bun @changesets/cli@3.0.3 add
```

Choose `patch`, `minor`, or `major` and write a summary for package consumers. In `0.x`, a minor release may break compatibility; a patch must not. A Mantine upgrade in Metabase is a minor release. Commit the generated file under `.changeset/`. Changes that don't affect consumers don't need a changeset.

When changesets land on `master`, the **UI Package Changesets** workflow opens or updates a release PR with the next version and changelog. Merging that PR runs **Release UI Package** to smoke-test, publish, and tag the merge commit. Ordinary changeset PRs don't publish anything.

You can still run **Release UI Package** manually from `master` to dry-run or publish the version already committed there. Stable `X.Y.Z` versions publish to `latest`; manually prepared `X.Y.Z-canary.N` versions publish to `canary`.

If the release PR merges before Changesets accounts for a newly landed changeset, publishing stops. Wait for the next release PR (or run **UI Package Changesets** manually to refresh it) rather than manually publishing the stale version.

Before enabling live publishing, create the GitHub environment `ui-package-release` and restrict deployments to the `master` branch only. In npm, register `metabase/metabase`, workflow `release-ui-package.yml`, and environment `ui-package-release` as the trusted publisher. Enable `npm publish` under **Allowed actions**; staged publish alone is not enough.

A dry run resolves the version, checks that the `ui-v<version>` tag and the npm version don't exist yet, builds the package, and smoke-tests the packed archive in Chromium. It doesn't prove that npm authentication works, so the first real run can still fail at the publish step.

The tested archive is uploaded as the `metabase-ui-<version>-<sha7>-attempt-<n>` artifact, also on dry runs, and kept for 90 days. A real run builds and tests again, publishes the archive its own smoke job tested, then pushes the `ui-v<version>` tag on the released commit. It doesn't reuse an earlier dry run's archive.

To retry a failed automatic release, use **Re-run failed jobs** on the original run. If no run exists, dispatch **Release UI Package** from `master` with `release_commit` set to the full SHA of the intended release on `master`. If npm accepted the tarball but the publish job reported failure, do not retry the publish. Compare `npm view @metabase/ui@<version> dist.integrity` with the SHA-512 integrity of the tested tarball (`sha512-` followed by the base64-encoded digest). Only if they match, and the tag is absent, create the tag on the commit recorded in that run's summary.

### Manual first publish

If the workflow can't publish yet (for example, npm trusted publishing isn't set up), download the artifact from a green dry run on the commit you're releasing, unzip it to get the `.tgz` file, publish that file with `npm publish ./<file>.tgz --access public` without rebuilding (add `--tag canary` for a canary; do not pass `--tag latest` for a stable release), then push the `ui-v<version>` tag on that commit by hand. Don't run the workflow for that version again.
