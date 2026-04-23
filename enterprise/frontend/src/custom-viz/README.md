# @metabase/custom-viz

CLI and type definitions for creating custom visualizations for Metabase.

## Getting Started

### Pick the right version

`@metabase/custom-viz` is versioned to track the Metabase major you are targeting: MB `N` ↔ `@metabase/custom-viz@^0.N`. The npm dist-tags reflect this:

| dist-tag        | what it points at                                          |
| --------------- | ---------------------------------------------------------- |
| `NN-stable`     | latest stable release for MB major `NN` (e.g. `61-stable`) |
| `canary`        | rolling pre-release built from `master`                    |
| `latest`        | current gold MB major — promoted manually                  |

Install the tag matching your MB version, e.g.:

```bash
npx @metabase/custom-viz@61-stable init my-viz
```

### 1. Scaffold a new visualization

```bash
npx @metabase/custom-viz init my-viz
```

This creates a new directory with everything you need:

```
my-viz/
  src/index.tsx       # Your visualization code
  package.json
  vite.config.ts
  tsconfig.json
```

### 2. Install dependencies and start developing

```bash
cd my-viz
npm install
npm run dev        # Watch mode — rebuilds on changes
```

### 3. Build for production

```bash
npm run build
```

The build output will be in the `dist/` directory, ready to be loaded into Metabase.

## Project Structure

```
src/
  cli.ts            # CLI entry point (commander)
  index.ts          # Library entry point (type exports)
  templates.ts      # Scaffolding templates
  templates/        # Template files for `init` command
  types/            # Custom visualization type definitions
dist/               # Build output
vite.config.ts      # Vite build configuration
```
