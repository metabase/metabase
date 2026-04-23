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

The workflow never edits [package.json](package.json). The only thing bumped in the version-bump PR is the `version` field. The npm dist-tag is derived from the version's pre-release label.

### Version → npm dist-tag

Only two version shapes are accepted:

| Version in `package.json` | npm dist-tag |
| ------------------------- | ------------ |
| `X.Y.Z`                   | `latest`     |
| `X.Y.Z-canary.N`          | `canary`     |

The release script rejects anything else.

Convention:

- On `master`, use `-canary.N` so the release does not land under `latest`.
- On `release-x.NN.x`, use a clean `X.Y.Z` — it lands under `latest`.

### How to cut a release

1. Open a PR against the intended source branch (`master` for a canary; `release-x.NN.x` for a stable) that bumps `version` in [package.json](package.json).
2. (Optional) Preview what the workflow will resolve, from the repo root:

   ```bash
   ./bin/custom-viz/resolve-release.sh
   # version=...
   # npm_tag=...
   # git_tag=...
   ```
3. Land the PR through normal review + CI.
4. Go to the [**Release Custom Viz Package**](https://github.com/metabase/metabase/actions/workflows/release-custom-viz.yml) workflow and click **Run workflow**.
5. Fill in the inputs:

| Input        | Description                                                                              | Default    |
| ------------ | ---------------------------------------------------------------------------------------- | ---------- |
| **branch**   | Branch to release from. Must be `master` or `release-x.NN.x` (e.g. `release-x.60.x`)     | `master`   |
| **dry_run**  | Skip `npm publish` and `git push --tags`. Useful for validating the plan end-to-end.     | `false`    |

6. Click **Run workflow**.

### What the workflow does

1. `determine-release` — runs [`bin/custom-viz/resolve-release.sh`](../../../bin/custom-viz/resolve-release.sh) to read `version` from `package.json`, derive the npm dist-tag from its pre-release label, and compute the git tag `custom-viz-v<version>`.
2. `preflight` — fails if the git tag already exists or if the version is already published on npm, then runs `bun run check:package-versions`.
3. `build-and-publish` — installs, builds, and runs `npm publish --tag <npm_tag>` (skipped when `dry_run=true`).
4. `tag-git` — creates and pushes the annotated git tag `custom-viz-v<version>` (push skipped when `dry_run=true`).

### Local publishing (manual)

If you need to publish manually (e.g. for a one-off local build), you need an npm access token with publish access to the `@metabase` scope. Either set the `NPM_TOKEN` environment variable or run `npm login` before publishing.

```bash
bun run release
```
