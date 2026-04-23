# @metabase/custom-viz

CLI and type definitions for creating custom visualizations for Metabase.

## Getting Started

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
