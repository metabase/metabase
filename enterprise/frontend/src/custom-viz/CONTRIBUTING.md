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

## Publishing

To publish the package, you need an npm access token with publish access to the `@metabase` scope. Either set the `NPM_TOKEN` environment variable or run `npm login` before publishing.

```bash
bun run release
```
