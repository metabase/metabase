---
name: create-data-app
description: Scaffold a new Metabase data-app development project — a Vite + React + TypeScript project with hot-reload preview against a live Metabase, plus a production build that emits a single uploadable bundle. Use when the user asks to start, create, scaffold, or set up a data-app from scratch.
---

# Create a Metabase Data App

A Metabase **data-app** is a single JS bundle that the host loads inside a Near Membrane sandbox and renders inside its own React tree. This skill scaffolds a proper Vite + TypeScript project: source code in `src/` (multiple `.tsx` files allowed and encouraged), a dev server with HMR that previews the app against a real Metabase via the Embedding SDK, and `yarn build` producing a single `dist/index.js` to upload via Admin → Data apps.

**Always use TypeScript (`.tsx` / `.ts`).** Plain `.jsx` is not a supported scaffold output — every source file the agent creates must be TypeScript. The host endowments have public types you'll declare in `src/globals.d.ts` so usages of `globalThis.MetabaseProvider`, `globalThis.useQuestionQuery`, etc. are typed correctly.

## When to invoke this skill

- "scaffold a new data app" / "create a Metabase data app" / "set up a data-app project"
- Starting a fresh agent task that will produce a data-app bundle.

### Detecting an existing project

Before writing any files, check whether the working directory already looks
like a data-app project. Telltale signs:

- `src/index.tsx` (or `src/index.jsx` from an older scaffold) exists, **or**
- `vite.config.ts` with a `name: "__customVizPlugin__"` entry, **or**
- `package.json` whose `scripts` include `vite build` and depends on
  `@metabase/embedding-sdk-react`.

If any of these signals are present, **do not silently re-scaffold** — pause
and ask the user how to proceed. The exact question depends on whether the
project is already TypeScript:

- **TypeScript project (`.tsx` source)** — ask:
  > "I see this looks like an existing data-app project. Should I keep
  > working in it (extend the current `src/`), or do you want me to
  > scaffold a fresh project somewhere else?"

- **Old `.jsx` project** — the scaffold is TypeScript-only
  (`tsconfig.json` sets `allowJs: false`), so "keep working in it as `.jsx`"
  is not an option. Ask:
  > "This project is currently `.jsx`. The data-app scaffold is
  > TypeScript-only. I can either migrate it now (rename `.jsx` → `.tsx`,
  > add `tsconfig.json` + `src/globals.d.ts`, fix type errors) and then
  > work on your changes, or scaffold a fresh TypeScript project
  > somewhere else. Which would you like?"

Only continue once the user has answered:

- **"Keep / migrate this one"** → skip the file-writing steps below and
  edit the existing `src/` files (typically `src/App.tsx` and
  `src/components/`). For a `.jsx` project, do the migration first.
- **"Scaffold fresh"** → ask for the target path, then write the files
  there.

Do not overwrite existing files without explicit confirmation.

## What gets created

```
my-data-app/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html                  ← Vite dev entry
├── src/
│   ├── globals.d.ts            ← types for globalThis endowments (MetabaseProvider, …)
│   ├── index.tsx               ← PRODUCTION entry — exports the factory
│   ├── dev.tsx                 ← DEV entry — sets up globals, mounts App
│   ├── dev-globals.tsx         ← DEV-only: imports real SDK, populates globalThis
│   ├── App.tsx                 ← top-level component (you edit this)
│   └── components/             ← split components freely; multiple .tsx files OK
│       └── …
├── public/                     ← static assets if needed
├── dist/                       ← produced by `yarn build` (gitignored)
│   └── index.js                ← THE file to upload to Metabase
├── .env.local.example
├── .gitignore
└── README.md
```

## Two modes, same source

| | Source loaded | Output | Used for |
|---|---|---|---|
| **`yarn dev`** | `src/dev.tsx` (loads `dev-globals` then mounts `<App/>`) | http://localhost:5174 with HMR | Iterating visually against a real Metabase |
| **`yarn build`** | `src/index.tsx` (exports factory) | `dist/index.js` (single IIFE) | Uploading to Metabase |

`App.tsx` and everything in `src/components/` is shared between both modes. The split is only at the entry layer.

## Step 1 — Project files (write these verbatim)

### `package.json`

```json
{
  "name": "data-app",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --port 5174",
    "build": "vite build"
  },
  "dependencies": {
    "@metabase/embedding-sdk-react": "*",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.6.3",
    "vite": "^5.4.10"
  }
}
```

`@metabase/embedding-sdk-react` **must be at least v62** — earlier versions don't ship the component surface (`MetabaseProvider`, the question/dashboard components) the data-app contract depends on. Pin to the exact version matching your target Metabase when you commit (e.g. `"@metabase/embedding-sdk-react": "^62.0.0"`).

### `vite.config.ts`

```ts
import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Two output shapes from one project:
 *
 *   yarn dev   → serves index.html with HMR; loads src/dev.tsx, which sets up
 *                   globalThis endowments from the real SDK and renders <App/>.
 *
 *   yarn build → emits a single IIFE bundle at dist/index.js using lib mode.
 *                   The bundle assigns its factory default export to
 *                   globalThis.__customVizPlugin__ — the exact contract the
 *                   Metabase host expects when it evaluates uploaded bundles.
 *
 * `react` is externalized so the bundle uses the host's React (the one
 * Metabase endows on globalThis.React). That sharing is what makes hooks
 * work across the sandbox/host boundary. `jsxRuntime: "classic"` compiles
 * JSX to `React.createElement(...)` so we only need to externalize one
 * package (react), not also react/jsx-runtime.
 */
export default defineConfig({
  plugins: [react({ jsxRuntime: "classic" })],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, "src/index.tsx"),
      formats: ["iife"],
      fileName: () => "index.js",
      name: "__customVizPlugin__",
    },
    rollupOptions: {
      external: ["react"],
      output: { globals: { react: "React" } },
    },
  },
  server: { port: 5174, host: "localhost" },
});
```

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react",
    "jsxFactory": "React.createElement",
    "jsxFragmentFactory": "React.Fragment",
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "strict": true,
    "allowJs": false,
    "checkJs": false,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "forceConsistentCasingInFileNames": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

**This is a TypeScript-only project — `allowJs: false` is explicit, not just the default.** Every source file must be `.ts` or `.tsx`. The agent must not author `.js` / `.jsx` and must not weaken `strict`. Type the props/state/utilities it writes — including any data shapes returned by `useQuestionQuery` (cast or type the rows/columns at the read site so downstream code is type-safe).

### `index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Data App Dev Preview</title>
    <style>
      html, body, #root { height: 100%; margin: 0; }
      body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/dev.tsx"></script>
  </body>
</html>
```

### `src/globals.d.ts` — types for host endowments

```ts
import type {
  CollectionBrowser,
  CreateDashboardModal,
  CreateQuestion,
  EditableDashboard,
  InteractiveDashboard,
  InteractiveQuestion,
  MetabaseTheme,
  MetabotQuestion,
  StaticDashboard,
  StaticQuestion,
  useQuestionQuery,
} from "@metabase/embedding-sdk-react";
import type * as ReactNS from "react";

declare global {
  // React is endowed by the host (via Vite's `external: ["react"]` mapping)
  // and the JSX classic runtime emits `React.createElement(...)`, so the
  // `React` global must exist at runtime. Type it here so plain `<div/>`
  // and `globalThis.React.useState` both check.
  const React: typeof ReactNS;

  // SDK components endowed by the host (in prod) and by src/dev-globals.tsx
  // (in dev). Treat them as bound at module load — read them off
  // `globalThis` from any source file.
  // eslint-disable-next-line vars-on-top, no-var
  var MetabaseProvider: (props: {
    theme?: MetabaseTheme;
    children?: ReactNS.ReactNode;
  }) => ReactNS.ReactElement;
  // eslint-disable-next-line vars-on-top, no-var
  var InteractiveQuestion: typeof InteractiveQuestion;
  // eslint-disable-next-line vars-on-top, no-var
  var StaticQuestion: typeof StaticQuestion;
  // eslint-disable-next-line vars-on-top, no-var
  var CreateQuestion: typeof CreateQuestion;
  // eslint-disable-next-line vars-on-top, no-var
  var MetabotQuestion: typeof MetabotQuestion;
  // eslint-disable-next-line vars-on-top, no-var
  var EditableDashboard: typeof EditableDashboard;
  // eslint-disable-next-line vars-on-top, no-var
  var InteractiveDashboard: typeof InteractiveDashboard;
  // eslint-disable-next-line vars-on-top, no-var
  var StaticDashboard: typeof StaticDashboard;
  // eslint-disable-next-line vars-on-top, no-var
  var CreateDashboardModal: typeof CreateDashboardModal;
  // eslint-disable-next-line vars-on-top, no-var
  var CollectionBrowser: typeof CollectionBrowser;
  // eslint-disable-next-line vars-on-top, no-var
  var useQuestionQuery: typeof useQuestionQuery;
}

export {};
```

This file makes `globalThis.StaticQuestion`, `<MetabaseProvider/>`, etc. type-check everywhere. It re-exports the SDK package's types (which the agent's source code never actually `import`s at runtime — they're erased after compilation).

### `src/index.tsx` — production entry

```tsx
import App from "./App";

type Factory = (hostApi: Record<string, unknown>) => {
  component: React.ComponentType;
};

/**
 * Production entry. Vite lib mode emits an IIFE whose return value is
 * assigned to globalThis.__customVizPlugin__ (the `name` field in
 * vite.config.ts). The Metabase host evaluates the bundle text, reads
 * `__customVizPlugin__` back out, calls it with hostApi, and renders the
 * returned `component` inside its own React tree.
 */
const factory: Factory = (_hostApi) => ({ component: App });

export default factory;
```

### `src/dev-globals.tsx` — dev-only endowment setup

```tsx
import {
  CollectionBrowser,
  CreateDashboardModal,
  CreateQuestion,
  EditableDashboard,
  InteractiveDashboard,
  InteractiveQuestion,
  type MetabaseAuthConfig,
  MetabaseProvider as SdkMetabaseProvider,
  type MetabaseTheme,
  MetabotQuestion,
  StaticDashboard,
  StaticQuestion,
  useQuestionQuery,
} from "@metabase/embedding-sdk-react";
import * as React from "react";

/**
 * In production, the Metabase host endows React + SDK components on
 * globalThis before evaluating the bundle. In dev, this module mirrors
 * that setup using the real SDK package, so the same App.tsx source
 * works in both modes without dev/prod branches.
 *
 * MetabaseProvider is wrapped so the bundle's call
 *   <MetabaseProvider theme={...}>…</MetabaseProvider>
 * stays auth-agnostic — the authConfig is injected here from .env.local.
 */
const authConfig: MetabaseAuthConfig = {
  metabaseInstanceUrl: import.meta.env.VITE_MB_URL,
  apiKey: import.meta.env.VITE_MB_API_KEY,
};

function MetabaseProvider({
  theme,
  children,
}: {
  theme?: MetabaseTheme;
  children?: React.ReactNode;
}) {
  return (
    <SdkMetabaseProvider authConfig={authConfig} theme={theme}>
      {children}
    </SdkMetabaseProvider>
  );
}

globalThis.React = React;
globalThis.MetabaseProvider = MetabaseProvider;
globalThis.InteractiveQuestion = InteractiveQuestion;
globalThis.StaticQuestion = StaticQuestion;
globalThis.CreateQuestion = CreateQuestion;
globalThis.MetabotQuestion = MetabotQuestion;
globalThis.EditableDashboard = EditableDashboard;
globalThis.InteractiveDashboard = InteractiveDashboard;
globalThis.StaticDashboard = StaticDashboard;
globalThis.CreateDashboardModal = CreateDashboardModal;
globalThis.CollectionBrowser = CollectionBrowser;
globalThis.useQuestionQuery = useQuestionQuery;
```

You'll also need a `vite-env.d.ts` (or the same `globals.d.ts`) entry for the env vars:

```ts
interface ImportMetaEnv {
  readonly VITE_MB_URL: string;
  readonly VITE_MB_API_KEY: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

### `src/dev.tsx` — dev entry

```tsx
import "./dev-globals";

import { createRoot } from "react-dom/client";

import App from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");
createRoot(root).render(<App />);
```

The `import "./dev-globals"` line is intentionally the first statement so all `globalThis.*` assignments run before `App.tsx` evaluates and reads them.

### `src/App.tsx` — starter

```tsx
import type { MetabaseTheme } from "@metabase/embedding-sdk-react";

// SDK components are endowed on globalThis by the host in production and
// by src/dev-globals.tsx in dev. Read them at module load time — when this
// module evaluates, the endowments are already in place. Types come from
// src/globals.d.ts.
const { MetabaseProvider, StaticQuestion } = globalThis;

const sdkTheme: MetabaseTheme = {
  colors: {
    brand: "#4D96FF",
    "brand-hover": "#4D96FF",
    positive: "#4D96FF",
    charts: ["#4D96FF"],
    // The SDK widget's surface — match the IMMEDIATE PARENT of the chart.
    background: "white",
    "background-secondary": "white",
    // Text on the SDK surface — must contrast with `background`.
    "text-primary": "#1f2937",
    "text-secondary": "#4b5563",
    "text-tertiary": "#6b7280",
  },
  fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
};

export default function App() {
  return (
    <MetabaseProvider theme={sdkTheme}>
      <div style={{ minHeight: "100vh", background: "#f5f5f7" }}>
        <header style={{ padding: 24 }}>
          <h1 style={{ margin: 0 }}>Hello, data app</h1>
          <p style={{ color: "#555" }}>Edit src/App.tsx to begin.</p>
        </header>
        <div style={{ margin: 24, padding: 16, background: "white", borderRadius: 12 }}>
          <div style={{ height: 360, overflow: "hidden" }}>
            <StaticQuestion
              questionId={1}
              withChartTypeSelector={false}
              height="100%"
              width="100%"
            />
          </div>
        </div>
      </div>
    </MetabaseProvider>
  );
}
```

### `.env.local.example`

```
VITE_MB_URL=http://localhost:3000
VITE_MB_API_KEY=mb_replace_me
```

### `.gitignore`

```
node_modules
.env.local
.vite
dist
```

### `README.md`

```md
# data-app

A Metabase data-app authored as a Vite + React + TypeScript (TSX) project.

## Dev (HMR preview against a real Metabase)

```bash
yarn
cp .env.local.example .env.local
# fill VITE_MB_URL + VITE_MB_API_KEY (Admin → Authentication → API keys)
yarn dev
```

Open http://localhost:5174.

## Build (single bundle for upload)

```bash
yarn build
# → dist/index.js
```

Upload `dist/index.js` via Metabase Admin → Data apps → Add.

## CORS

The SDK on `:5174` hits Metabase on a different origin. In
Admin → Embedding → Embedded analytics SDK → CORS, add
`http://localhost:5174`.
```

## Step 2 — Install + run

```bash
yarn
cp .env.local.example .env.local
# fill in VITE_MB_URL + VITE_MB_API_KEY
yarn dev      # preview at http://localhost:5174
# …iterate on src/App.tsx and friends; HMR reloads on save…
yarn build    # produces dist/index.js
```

## Source conventions

### 1. Write normal TSX.

The source is plain ESM + TSX:

```tsx
// src/components/PokemonCard.tsx
type Pokemon = { name: string; questionId: number };

const { StaticQuestion } = globalThis;

export default function PokemonCard({ pokemon }: { pokemon: Pokemon }) {
  return (
    <article style={{ /* … */ }}>
      <h3>{pokemon.name}</h3>
      <StaticQuestion questionId={pokemon.questionId} height={300} width="100%" />
    </article>
  );
}
```

`.jsx` is **not** acceptable — every new file is `.tsx` (for components) or `.ts` (for data / helpers). The agent should never produce plain `.jsx` for new code.

### 2. Multiple files are encouraged

Split components, helpers, data into separate files in `src/`. Vite bundles everything in `src/` reachable from `src/index.tsx` into a single `dist/index.js` IIFE.

```
src/
├── globals.d.ts
├── index.tsx
├── App.tsx
├── components/
│   ├── Hero.tsx
│   ├── PokemonCard.tsx
│   └── TypePill.tsx
├── data/
│   └── pokemon.ts
└── theme.ts
```

### 3. Read SDK components from `globalThis`, NOT from `@metabase/embedding-sdk-react`

In source code, **never `import` runtime values from `@metabase/embedding-sdk-react`**. The SDK is loaded into the host page and exposed on `globalThis`. Importing the npm package would inline a second copy into your bundle — bigger output, broken contexts, separate Redux store.

```tsx
// ✅ correct — runtime values from globalThis, types via `import type`
import type { MetabaseTheme } from "@metabase/embedding-sdk-react";
const { MetabaseProvider, StaticQuestion } = globalThis;

// ❌ wrong — bundles a second SDK copy
import { MetabaseProvider, StaticQuestion } from "@metabase/embedding-sdk-react";
```

`import type { … } from "@metabase/embedding-sdk-react"` is fine — type-only imports are erased by the TypeScript compiler and don't end up in the bundle.

The only file that does a *runtime* import from the SDK package is `src/dev-globals.tsx`, and only for the dev preview — `dev-globals.tsx` is never reached from `src/index.tsx`, so it's tree-shaken out of the production build.

### 4. `React` is in scope automatically

Vite's JSX classic runtime compiles `<div/>` to `React.createElement("div")`. The bundle externalizes `react` and maps it to `globalThis.React` (the host's React). You don't need to `import React from "react"` in every file — `src/globals.d.ts` declares `React` as a global so TS is happy without the import.

**Do not** use `import { useState } from "react"` for hooks — pull them off the global React:

```ts
const { useState, useEffect, useMemo } = React;
```

Importing hooks from `"react"` works at runtime (`react` is externalized → resolves to host React), but it pulls those hook names into the bundle's import graph and can confuse Rollup's tree-shaking. The destructure-from-global form is the convention.

### 5. Production entry exports the factory

`src/index.tsx` is the production entry. It must `export default` a factory function returning `{ component }`:

```tsx
import App from "./App";

type Factory = (hostApi: Record<string, unknown>) => {
  component: React.ComponentType;
};

const factory: Factory = (_hostApi) => ({ component: App });
export default factory;
```

Vite lib mode + `name: "__customVizPlugin__"` makes the bundle assign this factory to `globalThis.__customVizPlugin__`, which is the contract the Metabase host reads.

## Theme rules (unchanged from the older convention)

`MetabaseProvider`'s `theme` is the only way SDK component appearance changes. It is NOT a stylesheet for the bundle's own chrome.

| Field | Purpose | Notes |
|---|---|---|
| `colors.brand`, `colors.brand-hover` | Accent for SDK widgets | Use the data app's primary color. |
| `colors.charts` | Chart palette | Array of strings. Use vivid brand-shade colors only; **never pale tints** — palette index 1+ may render labels and pale-on-white is invisible. |
| `colors.positive` / `colors.negative` | Semantic indicators | |
| `colors.background`, `colors.background-secondary` | SDK component surface | **MUST match the immediate parent container of the SDK component.** If the chart sits inside a white card, use `"white"`. If it sits on a tinted page, use that tint. |
| `colors.text-primary`, `text-secondary`, `text-tertiary` | Text on SDK surfaces | **MUST contrast with `background`.** For white bg: use `#1f2937` or similar dark color. The SDK's default `text-primary` resolves to ~white, so leaving it unset on a white surface produces invisible white text. **Always pair `background` and `text-primary` when overriding.** |
| `fontFamily` | SDK widget typography | |

**Never put page-chrome colors in the theme.** Style page chrome with inline `style={{ background: "#f5f5f7" }}` on your own `div`s.

**Don't expect per-subtree theming.** Multiple `<MetabaseProvider>`s on the page fight for the single CSS-variable slot. If the look needs to change with state, recompute `sdkTheme` at the App level and re-render — the whole tree re-themes.

## Available endowments

Set on `globalThis` by the host in production and by `src/dev-globals.jsx` in dev.

| Endowment | Purpose |
|---|---|
| `React` | Host React. Use `globalThis.React.useState` etc. for hooks. |
| `MetabaseProvider` | Wraps the root; takes `{ theme, children }`. |
| `StaticQuestion` | Non-drillable question. Props include `questionId`, `withChartTypeSelector`, `height`, `width`. |
| `InteractiveQuestion` | Drillable question. Same props as StaticQuestion plus drill behaviors. |
| `CreateQuestion`, `MetabotQuestion` | More question variants. |
| `StaticDashboard`, `InteractiveDashboard`, `EditableDashboard` | Dashboard variants. |
| `CreateDashboardModal` | Modal for new-dashboard flow. |
| `CollectionBrowser` | Collection picker. |
| `useQuestionQuery` | Hook that runs a saved question and returns its dataset (`{ data, isLoading, error, refetch }`). Use when you want to read raw query results (rows, columns, metadata) and render your own UI from them instead of dropping in a `StaticQuestion` / `InteractiveQuestion`. **Signature:** `useQuestionQuery(questionId, options?)` — the first arg is the bare numeric id, NOT an object. The optional second arg is `{ initialSqlParameters?, enabled? }`. Must be called from inside a component rendered under `MetabaseProvider`. |

Network APIs (`fetch`, `XMLHttpRequest`, `WebSocket`, etc.) are blocked by the sandbox in production. Never make direct network requests from the bundle — let the SDK components do the talking.

### When to use `useQuestionQuery` vs a `StaticQuestion` / `InteractiveQuestion`

This is a decision the agent makes per-rendering, not once for the whole app:

- **`StaticQuestion` / `InteractiveQuestion`** — use ONLY when a stock Metabase chart, displayed as-is, is exactly what the data app needs. No surrounding custom layout that the chart has to integrate with, no custom interactions, no derived/aggregated values pulled out of the dataset, no per-row UI, no list/grid/card pattern built from the rows. The SDK widget renders its own chrome, sizing, and interaction model — you take it or leave it.
- **`useQuestionQuery`** — use **whenever ANY of the following applies**, even slightly:
    - You want to render the data as something other than the saved question's visualization type (a stat tile, a list of cards, a custom table, a Pokémon-style grid, a sparkline, anything bespoke).
    - You need to read a single value out of the result (e.g. "the count from the first row", "the sum of column X") and display it.
    - You want to drive your own state or other components from the rows (filters, selections, derived dashboards-of-tiles, etc.).
    - You need to format, transform, group, or join the rows before display.
    - You want custom empty/loading/error states.
    - You want the data layout to integrate with the surrounding bundle UI (consistent fonts, spacings, branded headers, etc.) that the SDK widget can't be styled into.

**Default to `useQuestionQuery`.** Reach for `StaticQuestion`/`InteractiveQuestion` only when the saved-question chart, with its own framing, IS the deliverable. The moment the user asks for "something custom" — even subtle, even just "show the count nicely" — switch to `useQuestionQuery` and render the UI yourself.

The hook returns `{ data, isLoading, error, ... }` from the SDK. Read `data` once it's loaded to get rows/columns/metadata; render with normal React. Hooks must be called from inside a component rendered under `MetabaseProvider`.

#### Call each question at most once per render tree

**Call `useQuestionQuery(N)` exactly once per unique question id** in the rendered tree. Calling it from multiple components with the same id is almost never what you want:

- Each call mounts an independent subscription and fires its own query — same rows fetched multiple times, more bytes, slower first paint, and the components can briefly disagree if one finishes before the other.
- The query state (`isLoading`, `error`, `data`) is duplicated, so each consuming component has to handle the loading dance separately even though they're all waiting on the same query.

Lift the call to the highest component that needs the data, then **pass the result down as props** (or a context if the consumers are deep). Each consumer becomes a pure render of one shared `data`/`isLoading`/`error` triple. Think of `useQuestionQuery(N)` as defining a single "data source" per question — derived values (count, sum, top-K, filtered subset) come from JS on top of that one `data`, not from extra calls.

```tsx
// ✅ One call, derived values + multiple presentations
function Dashboard() {
  const { useQuestionQuery } = globalThis;
  const { data, isLoading, error } = useQuestionQuery(1);
  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  if (!data) return null;

  const rows = data.rows;
  const total = rows.length;
  const topByValue = [...rows].sort((a, b) => Number(b[2]) - Number(a[2])).slice(0, 5);

  return (
    <>
      <StatTile label="Total customers" value={total} />
      <TopList rows={topByValue} />
      <CustomTable rows={rows} cols={data.cols} />
    </>
  );
}

// ❌ Same question fetched three times
function Dashboard() {
  return (
    <>
      <StatTile /> {/* calls useQuestionQuery(1) */}
      <TopList />  {/* calls useQuestionQuery(1) */}
      <CustomTable /> {/* calls useQuestionQuery(1) */}
    </>
  );
}
```

Different ids, or the same id with different `initialSqlParameters`, are different data sources — call them separately. Same id + same parameters → fetch once.

## SDK component sizing

SDK components do NOT auto-fit their parent. Always pass explicit dimensions:

```jsx
<div style={{ height: 360, overflow: "hidden" }}>
  <StaticQuestion
    questionId={1}
    height="100%"
    width="100%"
    withChartTypeSelector={false}
  />
</div>
```

Without `height`/`width`, the SDK component renders at its intrinsic size and overflows.

## Upload to Metabase

1. `yarn build` → produces `dist/index.js`.
2. Open Metabase → Admin → Data apps → **Add**.
3. Pick a short `name` (used in `/data-app/<name>` URL) and a display name.
4. Upload `dist/index.js`.
5. The data app is now reachable at `/data-app/<name>`.

To replace: delete the data app, upload again. Per-app replace endpoint isn't wired yet.

## Common pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| Preview shows "Failed to fetch the user, the session might be invalid." | Wrong/missing API key, or CORS blocked. | Verify `curl -H "X-API-Key: $KEY" $URL/api/user/current`. Add `http://localhost:5174` to Metabase's SDK CORS origins. |
| Chart renders but with invisible labels. | `text-primary` not set against a light `background`. | Set `text-primary: "#1f2937"` (or similar) in the theme. |
| Chart overflows its container. | No `height`/`width` props on SDK component. | Pass `height="100%"` `width="100%"` and constrain the parent. |
| "Invalid hook call" at runtime. | Imported hook from `react` and `react` wasn't externalized. | Check `vite.config.ts` has `external: ["react"]` + `globals: { react: "React" }`. Or grab hooks off `globalThis.React`. |
| Bundle is huge (multi-MB). | Runtime-imported `@metabase/embedding-sdk-react` in `src/App.tsx` or another non-dev file. | Switch to `globalThis.X` lookups (with `import type` for types only); SDK runtime imports belong only in `src/dev-globals.tsx`. |
| `dist/index.js` doesn't assign anything to `__customVizPlugin__`. | Lib mode `name` not set in vite.config. | Verify `lib.name: "__customVizPlugin__"` in `vite.config.ts`. |
| Preview tab is blank, console says `MetabaseProvider is undefined`. | `src/App.tsx` runs before `src/dev-globals.tsx` evaluates. | Make sure `src/dev.tsx` does `import "./dev-globals"` BEFORE `import App from "./App"`. |
| `globalThis.MetabaseProvider` (or similar) shows as `any` / red-underlined in the editor. | `src/globals.d.ts` missing or not in `tsconfig.json#include`. | Confirm `src/globals.d.ts` exists with the `declare global` block and that `tsconfig.json` includes `"src"`. |

## Where to go next

Once the project files are in place (whether freshly scaffolded or detected
as existing):

1. **Confirm what the data app should do.** If the user hasn't already
   described the screen / charts / flow, ask before generating code.
2. **Write the app.** Edit `src/App.tsx` and split additional pieces into
   `src/components/*.tsx` (or `src/*.ts` for helpers) — Vite bundles all of
   `src/` reachable from `src/index.tsx` into a single `dist/index.js`, so
   file count is free.
3. **Iterate in the preview** at `http://localhost:5174` (`yarn dev`). HMR
   reloads on save.
4. **Ship.** Run `yarn build` to produce `dist/index.js`, then upload that
   file via Admin → Data apps.
