# Docs for development on the custom-viz package

These docs cover building and releasing the `@metabase/custom-viz` package locally. If you just want to use the package, see the [README](README.md).

## Prerequisites

- Node.js >= 20
- bun >= 1

## Development

```bash
# Install dependencies
bun install

# Build in watch mode
bun run dev

# Production build
bun run build
```

## Linting & Formatting

```bash
# Lint (uses oxlint)
bun run lint

# Format code
bun run format

# Check formatting
bun run format:check
```

## Releasing

Releases are published via the **Release Custom Viz Package** GitHub Actions workflow ([`.github/workflows/release-custom-viz.yml`](../../../.github/workflows/release-custom-viz.yml)).

The workflow never edits [package.json](package.json). The only thing bumped in the version-bump PR is the `version` field. The npm dist-tag, git tag, and (on release branches) the moving stable tag are all derived from the version + branch by [`bin/custom-viz/resolve-release.sh`](../../../bin/custom-viz/resolve-release.sh).

### Versioning model

Versions mirror the Metabase major they target:

```
0.<MB-major>.<patch>[-canary.<n>]
```

Two channels, tied to the branch the release is cut from:

| Branch              | Version in `package.json`   | npm dist-tag                   | moving git tag                                       |
| ------------------- | --------------------------- | ------------------------------ | ---------------------------------------------------- |
| `master`            | `0.NN.0-canary.K`           | `canary`                       | —                                                    |
| `release-x.NN.x`    | `0.NN.M`                    | `NN-stable` (e.g. `61-stable`) | `custom-viz-NN-stable` (force-moved to this version) |

`NN` in `package.json` **must** match the major of the release branch. The resolver rejects cross-branch combinations (e.g. `0.61.0` on `release-x.60.x`, or `0.61.0` on `master`), as well as any pre-release label other than `canary` on master.

### Compatibility rule for consumers

MB major `N` ↔ `@metabase/custom-viz@^0.N`. Instead of maintaining a compatibility chart, we tell users:

- "Running MB 61? `npm i -D @metabase/custom-viz@61-stable` (or `^0.61.0`)."
- `latest` is **only** promoted manually once a given `release-x.NN.x` becomes the gold stable branch — see [Promoting `latest`](#promoting-latest) below. Until then, users pin to `NN-stable`.

When a new release branch is cut, master's `version` is bumped to `0.<NN+1>.0-canary.0` as part of the branch-cut workflow (same pattern as the embedding SDK's `package.template.json` bump).

### How to cut a release

1. Open a PR against the intended source branch that bumps `version` in [package.json](package.json) to the next shape from the table above.
2. (Optional) Preview what the workflow will resolve, from the repo root:

   ```bash
   BRANCH=master ./bin/custom-viz/resolve-release.sh
   # version=0.61.0-canary.0
   # npm_tag=canary
   # git_tag=custom-viz-v0.61.0-canary.0
   # stable_tag=

   BRANCH=release-x.61.x CUSTOM_VIZ_PKG=/tmp/fake.json ./bin/custom-viz/resolve-release.sh
   # (set CUSTOM_VIZ_PKG to a scratch file to preview without editing the real one)
   ```
3. Land the PR through normal review + CI.
4. Go to the [**Release Custom Viz Package**](https://github.com/metabase/metabase/actions/workflows/release-custom-viz.yml) workflow and click **Run workflow**.
5. Fill in the inputs:

| Input        | Description                                                                              | Default    |
| ------------ | ---------------------------------------------------------------------------------------- | ---------- |
| **branch**   | Branch to release from. Must be `master` or `release-x.NN.x` (e.g. `release-x.61.x`)     | `master`   |
| **dry_run**  | Skip `npm publish` and git tag pushes. Useful for validating the plan end-to-end.        | `false`    |

6. Click **Run workflow**.

### What the workflow does

1. `determine-release` — runs [`bin/custom-viz/resolve-release.sh`](../../../bin/custom-viz/resolve-release.sh) with `BRANCH` set to the selected input, which validates the version shape, derives the npm dist-tag, and computes both the per-version git tag (`custom-viz-v<version>`) and the moving stable tag (`custom-viz-NN-stable`, only on release-branch stable publishes).
2. `preflight` — fails if the per-version git tag already exists or if the version is already published on npm, then runs `bun run check:package-versions`.
3. `build-and-publish` — installs, builds, and runs `npm publish --tag <npm_tag>` (skipped when `dry_run=true`).
4. `tag-git` — creates + pushes the per-version tag, and (when non-empty) force-moves the `custom-viz-NN-stable` tag to the new commit. Pushes skipped when `dry_run=true`.

### Promoting `latest`

The workflow never touches the `latest` dist-tag. Once a `release-x.NN.x` branch is promoted to gold, run manually from a workstation with publish rights to the `@metabase` scope:

```bash
npm dist-tag add @metabase/custom-viz@<version> latest
```

This keeps `latest` pinned to whatever we consider the currently-supported stable major — it never drifts to a canary from master, and never flips to a newer branch before it is ready.

### Local publishing (manual)

If you need to publish manually (e.g. for a one-off local build), you need an npm access token with publish access to the `@metabase` scope. Either set the `NPM_TOKEN` environment variable or run `npm login` before publishing.

```bash
bun run release
```

### Testing the resolver locally

```bash
./bin/custom-viz/resolve-release.test.sh
```
