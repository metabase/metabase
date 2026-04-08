# Contributing to @metabase/custom-viz

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

### How to trigger a release

1. Go to the [**Release Custom Viz Package**](https://github.com/metabase/metabase/actions/workflows/release-custom-viz.yml) workflow in GitHub Actions.
2. Click **Run workflow** and fill in the inputs:

| Input      | Description                                   | Default       |
| ---------- | --------------------------------------------- | ------------- |
| **branch** | Branch to release from                        | `master`      |
| **version**| Version to publish (e.g. `0.1.0`, `0.1.0-alpha.1`) | _(required)_ |
| **npm_tag**| NPM dist-tag (`latest`, `next`, or `canary`)  | `latest`      |

3. Click **Run workflow**.

### What the workflow does

1. Checks out the specified **branch**.
2. Sets the **version** in `package.json` (without creating a git tag).
3. Installs dependencies, builds the package, and **publishes to NPM** under the chosen dist-tag.
4. Creates a **version-bump PR** back to the source branch (auto-approved and auto-merged) so `package.json` stays in sync.

### Which npm tag to use

- **`latest`** — stable releases consumed by production users.
- **`next`** — pre-release versions for testing upcoming changes.
- **`canary`** — experimental builds for internal testing.

### Local publishing (manual)

If you need to publish manually (e.g. for a one-off local build), you need an npm access token with publish access to the `@metabase` scope. Either set the `NPM_TOKEN` environment variable or run `npm login` before publishing.

```bash
bun run release
```
