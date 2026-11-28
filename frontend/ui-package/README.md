# @metabase/ui

Metabase's UI components, theme, colors and icons, built from [`frontend/src/metabase/ui`](../src/metabase/ui). For Metabase's own products; it isn't supported for other use. Licensed under AGPL-3.0-or-later. The full license text is included in `LICENSE.txt`.

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

1. Run [UI Package Version Bump PR](https://github.com/metabase/metabase/actions/workflows/ui-package-version-bump-pr.yml) from `master`. Select the bump. The workflow drafts the changelog from UI-related commits since `ui-v<current-version>`. It needs the dedicated `UI_CHANGELOG_OPENAI_API_KEY` repository secret and sends only the selected commit subjects to OpenAI.
2. Review the generated version and edit the changelog in the PR if needed. In `0.x`, a patch must be compatible; breaking changes and Mantine upgrades need at least a minor bump.
3. Merge the PR with its `ui-release-trigger` label. **Release UI Package** smoke-tests the tarball, publishes it to npm, and tags the merge commit. No second dispatch is needed.

If the bump workflow pushes a branch but cannot open the PR, open a PR from that branch to `master` and add `ui-release-trigger` rather than dispatching the bump again.

Manual **Release UI Package** dispatches still support dry runs or publishing a version already committed on `master`. Stable versions publish to `latest`; manually prepared canaries publish to `canary`.

The bump workflow starts from a stable version. If `master` is on a canary, open a PR to `master` that sets `frontend/ui-package/package.json` to the intended unpublished stable version (for example, `0.2.0-canary.1` → `0.2.0`) and adds its entry to `frontend/ui-package/CHANGELOG.md`. Apply `ui-release-trigger` before merging to publish that stable version. Subsequent releases can use the bump workflow again.

Before enabling live publishing, create the GitHub environment `ui-package-release` and restrict deployments to the `master` branch only. In npm, register `metabase/metabase`, workflow `release-ui-package.yml`, and environment `ui-package-release` as the trusted publisher. Enable `npm publish` under **Allowed actions**; staged publish alone is not enough.

A dry run resolves the version, checks that the `ui-v<version>` tag and the npm version don't exist yet, builds the package, and smoke-tests the packed archive in Chromium. It doesn't prove that npm authentication works, so the first real run can still fail at the publish step.

The tested archive is uploaded as the `metabase-ui-<version>-<sha7>-attempt-<n>` artifact, also on dry runs, and kept for 90 days. A real run builds and tests again, publishes the archive its own smoke job tested, then pushes the `ui-v<version>` tag on the released commit. It doesn't reuse an earlier dry run's archive.

To retry a failed automatic release, use **Re-run failed jobs** on the original run. If npm accepted the tarball but the publish job reported failure, do not retry the publish. Compare `npm view @metabase/ui@<version> dist.integrity` with the SHA-512 integrity of the tested tarball (`sha512-` followed by the base64-encoded digest). Only if they match, and the tag is absent, create the tag on the commit recorded in that run's summary.

### Manual first publish

If the workflow can't publish yet (for example, npm trusted publishing isn't set up), download the artifact from a green dry run on the commit you're releasing, unzip it to get the `.tgz` file, publish that file with `npm publish ./<file>.tgz --access public` without rebuilding (add `--tag canary` for a canary; do not pass `--tag latest` for a stable release), then push the `ui-v<version>` tag on that commit by hand. Don't run the workflow for that version again.
