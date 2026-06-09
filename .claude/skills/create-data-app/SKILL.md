---
name: create-data-app
description: Scaffold a new Metabase data-app development project — a Vite + React + TypeScript project with hot-reload preview against a live Metabase, plus a production build that emits a single uploadable bundle. Use when the user asks to start, create, scaffold, or set up a data-app from scratch.
---

# Create a Metabase Data App

A Metabase **data-app** is a single JS bundle that the host loads inside a Near Membrane sandbox and renders inside its own React tree. This skill scaffolds a proper Vite + TypeScript project: source code in `src/` (multiple `.tsx` files allowed and encouraged), a dev server with HMR that previews the app against a real Metabase via the Embedding SDK, and `yarn build` producing a single `dist/index.js` to upload via Admin → Data apps.

**Always use TypeScript (`.tsx` / `.ts`).** The bundle imports SDK values as normal package imports — `import { StaticQuestion } from "@metabase/embedding-sdk-react"` — and `vite.config.ts` externalizes those imports so the production iframe reads the host-realm copies at runtime. The Vite dev server resolves the same imports to the real npm package.

## When to invoke this skill

- "scaffold a new data app" / "create a Metabase data app" / "set up a data-app project"
- Starting a fresh agent task that will produce a data-app bundle.

### Detecting an existing project

Before writing any files, check whether the working directory already looks
like a data-app project. Telltale signs:

- `src/index.tsx` exists, **or**
- `vite.config.ts` with a `name: "__dataAppFactory__"` entry, **or**
- `package.json` whose `scripts` include `vite build` and depends on
  `@metabase/embedding-sdk-react`.

If any of these signals are present, **do not silently re-scaffold** — pause
and ask the user:

> "I see this looks like an existing data-app project. Should I keep
> working in it (extend the current `src/`), or do you want me to
> scaffold a fresh project somewhere else?"

Only continue once the user has answered:

- **"Keep working in this one"** → skip the file-writing steps below and
  edit the existing `src/` files (typically `src/App.tsx` and
  `src/components/`).
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
│   ├── index.tsx               ← PRODUCTION entry — factory returns { component, theme }
│   ├── dev.tsx                 ← DEV entry — wraps App with MetabaseProvider + authConfig
│   ├── theme.ts                ← MetabaseTheme, shared between dev + prod entries
│   ├── App.tsx                 ← top-level component (you edit this); pure content, no MetabaseProvider wrap
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
| **`yarn dev`** | `src/dev.tsx` (wraps `<App/>` in the SDK's `<MetabaseProvider authConfig={…}>` and mounts it) | http://localhost:5174 with HMR | Iterating visually against a real Metabase |
| **`yarn build`** | `src/index.tsx` (factory returns `{ component, theme }`; host wraps with `DataAppProvider`) | `dist/index.js` (single IIFE) | Uploading to Metabase |

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

// See "Two modes, same source" above.
//
// Externals:
//   - `react` → `globalThis.React`. The bundle uses the host's React
//     instance so there's only one React in the tree.
//   - `@metabase/embedding-sdk-react` → `globalThis.__metabase_sdk__`.
//     The SDK components and hooks (`MetabaseProvider`, `StaticQuestion`,
//     etc.) are host-realm so React state from them survives the Near
//     Membrane boundary correctly.
//   - `@metabase/embedding-sdk-react/data-app` → `globalThis.__metabase_data_app__`.
//     Host-owned primitives (routing, etc.) — same rationale.
//
// `jsxRuntime: "classic"` keeps `react` externalization to a single
// package (no separate `react/jsx-runtime` global needed).
export default defineConfig({
  plugins: [react({ jsxRuntime: "classic" })],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, "src/index.tsx"),
      formats: ["iife"],
      fileName: () => "index.js",
      name: "__dataAppFactory__",
    },
    rollupOptions: {
      external: [
        "react",
        "@metabase/embedding-sdk-react",
        "@metabase/embedding-sdk-react/data-app",
      ],
      output: {
        globals: {
          react: "React",
          "@metabase/embedding-sdk-react": "__metabase_sdk__",
          "@metabase/embedding-sdk-react/data-app": "__metabase_data_app__",
        },
      },
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

### `index.html`

**Write this verbatim. Do not edit it.** Production data-apps render inside an isolated iframe whose document is hard-coded to the exact head/CSS-reset/`#root` shell below (charset, viewport, `lang`, the CSS reset, the font-family). Diverging here means the bundle looks one way in the Vite dev preview and a different way in production — the iframe doesn't read this file. The host serves a byte-for-byte equivalent template at runtime, so any baseline tweak (different font, different reset) has to land in the host side first, not here.

Things you may NOT change in this file:
- The `lang` attribute, `<meta charset>`, or `<meta name="viewport">`.
- The CSS reset rules (`html, body, #root { height: 100%; margin: 0; }`).
- The `body` font-family declaration.

Things you may change:
- The `<title>` (cosmetic — only shown in the dev preview's browser tab).
- Adding more script tags is fine if you genuinely need them in dev (none should be needed for a normal data app).

If you want bundle-specific styles, put them in a CSS module or `<style>`/`<link>` inside a component — not here.

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

### `src/vite-env.d.ts` — env var types

The bundle no longer needs a `globals.d.ts` for SDK types — they come from `@metabase/embedding-sdk-react` as normal package types. The only ambient declarations needed are for the Vite env vars used in `dev.tsx`:

```ts
interface ImportMetaEnv {
  readonly VITE_MB_URL: string;
  readonly VITE_MB_API_KEY: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

### `src/theme.ts` — shared theme

Used by both the production `index.tsx` (passed through the factory) and the dev `dev.tsx` (passed to the dev preview's `<MetabaseProvider>`).

```ts
import type { MetabaseTheme } from "@metabase/embedding-sdk-react";

export const sdkTheme: MetabaseTheme = {
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
```

### `src/index.tsx` — production entry

```tsx
import type { MetabaseTheme } from "@metabase/embedding-sdk-react";

import App from "./App";
import { sdkTheme } from "./theme";

type Factory = () => {
  component: React.ComponentType;
  theme?: MetabaseTheme;
};

/**
 * Production entry. Vite lib mode emits an IIFE whose return value is
 * assigned to globalThis.__dataAppFactory__ (the `name` field in
 * vite.config.ts). The Metabase host evaluates the bundle text, reads
 * `__dataAppFactory__` back out, calls it with NO arguments, and wraps
 * the returned `component` in its own `DataAppProvider` (which sets up
 * the SDK Redux store, theme, and portal container in host realm).
 *
 * The bundle deliberately does NOT render `<MetabaseProvider>` inside
 * `App.tsx`. That's the host's job in prod, and the dev entry's job in
 * dev. Bundle-side wrapping would force the SDK's `setState`-via-listener
 * paths through the Near Membrane sandbox and break drill popups,
 * plugin init, and similar.
 *
 * The factory takes no arguments. Everything the host exposes to the
 * bundle comes through normal package imports from
 * `@metabase/embedding-sdk-react` and `@metabase/embedding-sdk-react/data-app`.
 */
const factory: Factory = () => ({ component: App, theme: sdkTheme });

export default factory;
```

### `src/dev.tsx` — dev entry

In production the host wraps the bundle in `DataAppProvider`. In dev there's no host, so the dev entry uses the SDK's real `<MetabaseProvider>` (which needs an `authConfig`) to set up the same providers locally.

```tsx
import {
  type MetabaseAuthConfig,
  MetabaseProvider,
} from "@metabase/embedding-sdk-react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { sdkTheme } from "./theme";

const authConfig: MetabaseAuthConfig = {
  metabaseInstanceUrl: import.meta.env.VITE_MB_URL,
  apiKey: import.meta.env.VITE_MB_API_KEY,
};

const root = document.getElementById("root");
if (!root) {
  throw new Error("#root not found");
}
createRoot(root).render(
  <MetabaseProvider authConfig={authConfig} theme={sdkTheme}>
    <App />
  </MetabaseProvider>,
);
```

### `src/App.tsx` — starter

`App.tsx` is **pure content** — no `<MetabaseProvider>` wrap (that's `dev.tsx` in dev and the host in prod). Imports come from the SDK package as normal; the bundle's `vite.config.ts` externalizes them so production references the host's copies at runtime, and Vite's dev server uses the real package directly.

```tsx
import { StaticQuestion } from "@metabase/embedding-sdk-react";

export default function App() {
  return (
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
See the project's SKILL.md for full guidance; the short version is `yarn`
then `yarn dev` (preview at http://localhost:5174 — first set
`VITE_MB_URL` + `VITE_MB_API_KEY` in `.env.local`), and `yarn build` to
produce `dist/index.js` for upload via Admin → Data apps → Add.

If the dev preview hits CORS, add `http://localhost:5174` under
Admin → Embedding → Embedded analytics SDK → CORS.
```

## Step 2 — Install + run

```bash
yarn
cp .env.local.example .env.local
# fill in VITE_MB_URL + VITE_MB_API_KEY (Admin → Authentication → API keys)
yarn dev      # preview at http://localhost:5174 with HMR
yarn build    # produces dist/index.js
```

## Source conventions

### 1. Write TSX.

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

### 3. Import SDK values from `@metabase/embedding-sdk-react` directly

Just use normal package imports. `vite.config.ts` externalizes both `@metabase/embedding-sdk-react` and `@metabase/embedding-sdk-react/data-app` so the build maps them to host-realm globals (`__metabase_sdk__` / `__metabase_data_app__`); the Vite dev server resolves them to the real npm package.

```tsx
// ✅ correct
import { StaticQuestion, useQuestionQuery } from "@metabase/embedding-sdk-react";
import { DataAppRouter, DataAppLink } from "@metabase/embedding-sdk-react/data-app";

// ❌ wrong — globalThis pattern is gone; you'd be reading nothing
const { MetabaseProvider, StaticQuestion } = globalThis;
```

**Do NOT render `<MetabaseProvider>` in `App.tsx`.** The dev entry (`src/dev.tsx`) and the production host both wrap your tree in a provider that lives in their own realm — wrapping inside the bundle would route the SDK's `setState`-via-listener paths through the Near Membrane sandbox and silently break drill popups, plugin init, and similar.

### 4. Import `react` normally too

The bundle's `vite.config.ts` externalizes `react` (mapped to `globalThis.React`), so a plain `import` resolves to the host's React in production and the npm package in dev. Same syntax in both modes:

```tsx
import { useState, useEffect, useMemo } from "react";
```

## Theme rules

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

## Available SDK surface

The bundle imports normally from `@metabase/embedding-sdk-react`. Vite externalizes the package at build time, so production references the host's copies at runtime (`globalThis.__metabase_sdk__`); the Vite dev server resolves to the real npm package directly.

`<MetabaseProvider>` is **not** rendered by the bundle's `App.tsx` — `dev.tsx` and the host wrap it for their respective modes. Bundle author only renders the **content** below.

| Import | Purpose |
|---|---|
| `React` (from `"react"`) | Hooks (`useState`, `useEffect`, etc.), JSX runtime. Externalized to the host's React via `react: "React"`. |
| `StaticQuestion` | Non-drillable question. Props include `questionId`, `withChartTypeSelector`, `height`, `width`. |
| `InteractiveQuestion` | Drillable question. Same props as StaticQuestion plus drill behaviors. |
| `CreateQuestion`, `MetabotQuestion` | More question variants. |
| `StaticDashboard`, `InteractiveDashboard`, `EditableDashboard` | Dashboard variants. |
| `CreateDashboardModal` | Modal for new-dashboard flow. |
| `CollectionBrowser` | Collection picker. |
| `useQuestionQuery` | Hook that runs a saved question and returns its dataset (`{ data, isLoading, error, refetch }`). Use when you want to read raw query results (rows, columns, metadata) and render your own UI from them instead of dropping in a `StaticQuestion` / `InteractiveQuestion`. **Signature:** `useQuestionQuery(questionId, options?)` — the first arg is the bare numeric id, NOT an object. The optional second arg is `{ initialSqlParameters?, enabled? }`. Must be called from inside a component rendered under `<MetabaseProvider>` (which `dev.tsx` and the host provide). |

### Blocked APIs

The Near Membrane sandbox throws at runtime on these globals. Use the endowed alternative instead:

- **Network** (`fetch`, `XMLHttpRequest`, `WebSocket`) → the data hooks for reads, `useAction` for writes. No raw network from the bundle, ever.
- **UI dialogs** (`alert`, `confirm`, `prompt`) → render a React modal in your own tree.
- **Storage** (`localStorage`, `sessionStorage`, `indexedDB`, `document.cookie`) → treat the Data App as stateless across reloads; persist via a Metabase action.
- **Window / history navigation** (`window.open`, `history.pushState`, `history.replaceState`) → `useDataAppNavigate()` for in-app, `<a target="_blank" rel="noopener">` for external.
- **`navigator.*` device APIs** (`clipboard`, `geolocation`, etc.) → not available.
- **Global event listeners on `document` / `window`** for typing or clipboard events (`keydown`, `keyup`, `keypress`, `beforeinput`, `input`, `paste`, `copy`, `cut`, `before*paste/copy/cut`, `compositionstart/update/end`, `storage`) → attach the listener to your own element instead, or use the React event handler (`onKeyDown`, `onPaste`, …) on the specific input/container that needs it. Same listener on a script-owned element still works.

**Rule of thumb:** if you're about to touch `window.X`, `document.X`, `navigator.X`, `history.X`, or any storage global, stop and pick the endowed replacement above. The endowed surface (React + SDK components + data hooks + `useAction` + DataAppRouter) covers every routine need; anything outside it is intentionally unreachable.

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

**Always render a spinner (or skeleton) while `isLoading` is `true`** — never an empty slot or stale value, which causes layout shift when the data arrives. Same rule for lifted/derived queries (pass `isLoading` down to each consumer) and for action triggers (`useAction`'s `isExecuting` → spinner in the button, plus `disabled={isExecuting}`).

#### Call each question at most once per render tree

**Call `useQuestionQuery(N)` exactly once per unique question id** in the rendered tree. Calling it from multiple components with the same id is almost never what you want:

- Each call mounts an independent subscription and fires its own query — same rows fetched multiple times, more bytes, slower first paint, and the components can briefly disagree if one finishes before the other.
- The query state (`isLoading`, `error`, `data`) is duplicated, so each consuming component has to handle the loading dance separately even though they're all waiting on the same query.

Lift the call to the highest component that needs the data, then **pass the result down as props** (or a context if the consumers are deep). Each consumer becomes a pure render of one shared `data`/`isLoading`/`error` triple. Think of `useQuestionQuery(N)` as defining a single "data source" per question — derived values (count, sum, top-K, filtered subset) come from JS on top of that one `data`, not from extra calls.

```tsx
// ✅ One call, derived values + multiple presentations
import { useQuestionQuery } from "@metabase/embedding-sdk-react";

function Dashboard() {
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

```tsx
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

| Symptom | Fix |
|---|---|
| "Failed to fetch the user, the session might be invalid." | Bad API key or CORS — check `curl -H "X-API-Key: $KEY" $URL/api/user/current`, add `http://localhost:5174` to SDK CORS origins. |
| Invisible chart labels. | Set `text-primary` in the theme (see *Theme rules*). |
| Chart overflows its container. | Pass `height` / `width` to the SDK component (see *SDK component sizing*). |
| "Invalid hook call" at runtime. | `react` not externalized — check `vite.config.ts`. |
| Bundle is multi-MB. | Runtime-importing `@metabase/embedding-sdk-react` from non-dev source (see *Source conventions §3*). |
| `dist/index.js` doesn't assign to `__dataAppFactory__`. | `lib.name: "__dataAppFactory__"` missing in `vite.config.ts`. |
| Dev preview blank, console says `MetabaseProvider is undefined`. | `src/dev.tsx` must `import "./dev-globals"` BEFORE `import App from "./App"`. |
| `Cannot find module '@metabase/embedding-sdk-react'`. | Run `yarn install` to install the SDK package. Types come from the package directly. |
| Drill popups don't open / SDK components show empty / "MetabaseProvider not found" at runtime in dev. | `src/dev.tsx` is missing the `<MetabaseProvider authConfig={…}>` wrap. The bundle's `App.tsx` does NOT include `MetabaseProvider` — `dev.tsx` provides it. |
| URL changes but UI doesn't update in production (works in dev). | `vite.config.ts` is missing `@metabase/embedding-sdk-react/data-app` in `external` / `output.globals`. Without it, the data-app routing primitives get inlined into the bundle and the React-state-batching-through-Near-Membrane bug breaks navigation re-renders. |

## Confirm scope before generating code

Once the project files are in place (whether freshly scaffolded or detected as existing), confirm what the data app should *do* before writing components. If the user hasn't already described the screen / charts / flow, ask first — code generated against an assumed brief is the most common rework cause.
