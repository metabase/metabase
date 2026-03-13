# @metabase/custom-viz

CLI for creating and bundling custom visualizations for Metabase.

## Prerequisites

- Node.js >= 20
- npm >= 10

## Development

```bash
# Install dependencies
npm install

# Build in watch mode
npm run dev

# Production build
npm run build
```

## Linting & Formatting

```bash
# Lint
npm run lint

# Format code
npm run format

# Check formatting
npm run format:check
```

## Publishing

This package uses [np](https://github.com/sindresorhus/np) for publishing.

```bash
npm run release
```

`np` will guide you through version bumping, run the build, and publish to npm.

## Project Structure

```
src/
  cli.ts          # CLI entry point (commander)
dist/             # Build output
vite.config.ts    # Vite build configuration
```
