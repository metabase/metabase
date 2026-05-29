---
name: create-data-app
description: Scaffold a new Metabase data-app development project — a Vite + React + JSX project with hot-reload preview against a live Metabase, plus a production build that emits a single uploadable bundle. Use when the user asks to start, create, scaffold, or set up a data-app from scratch.
---

# Create a Metabase Data App

A Metabase **data-app** is a single JS bundle that the host loads inside a Near Membrane sandbox and renders inside its own React tree. This skill scaffolds a proper Vite project: source code in `src/` (multiple `.jsx` files allowed and encouraged), a dev server with HMR that previews the app against a real Metabase via the Embedding SDK, and `yarn build` producing a single `dist/index.js` to upload via Admin → Data apps.

## When to invoke this skill

- "scaffold a new data app" / "create a Metabase data app" / "set up a data-app project"
- Starting a fresh agent task that will produce a data-app bundle.

### Detecting an existing project

Before writing any files, check whether the working directory already looks
like a data-app project. Telltale signs:

- `src/index.jsx` exists, **or**
- `vite.config.ts` with a `name: "__customVizPlugin__"` entry, **or**
- `package.json` whose `scripts` include `vite build` and depends on
  `@metabase/embedding-sdk-react`.

If any of these are present, **do not silently re-scaffold** — pause and ask
the user:

> "I see this looks like an existing data-app project. Should I keep working
> in it (extend the current `src/`), or do you want me to scaffold a fresh
> project somewhere else?"

Only continue once the user has answered:

- **"Keep working in this one"** → skip the file-writing steps below and
  edit the existing `src/` files (typically `src/App.jsx` and
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
│   ├── index.jsx               ← PRODUCTION entry — exports the factory
│   ├── dev.jsx                 ← DEV entry — sets up globals, mounts App
│   ├── dev-globals.jsx         ← DEV-only: imports real SDK, populates globalThis
│   ├── App.jsx                 ← top-level component (you edit this)
│   └── components/             ← split components freely; multiple .jsx files OK
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
| **`yarn dev`** | `src/dev.jsx` (loads `dev-globals` then mounts `<App/>`) | http://localhost:5174 with HMR | Iterating visually against a real Metabase |
| **`yarn build`** | `src/index.jsx` (exports factory) | `dist/index.js` (single IIFE) | Uploading to Metabase |

`App.jsx` and everything in `src/components/` is shared between both modes. The split is only at the entry layer.

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
 *   yarn dev   → serves index.html with HMR; loads src/dev.jsx, which sets up
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
      entry: resolve(__dirname, "src/index.jsx"),
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
    "allowJs": true,
    "checkJs": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "strict": false
  },
  "include": ["src", "vite.config.ts"]
}
```

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
    <script type="module" src="/src/dev.jsx"></script>
  </body>
</html>
```

### `src/index.jsx` — production entry

```jsx
import App from "./App";

/**
 * Production entry. Vite lib mode emits an IIFE whose return value is
 * assigned to globalThis.__customVizPlugin__ (the `name` field in
 * vite.config.ts). The Metabase host evaluates the bundle text, reads
 * `__customVizPlugin__` back out, calls it with hostApi, and renders the
 * returned `component` inside its own React tree.
 */
export default function factory(_hostApi) {
  return { component: App };
}
```

### `src/dev-globals.jsx` — dev-only endowment setup

```jsx
import * as React from "react";
import {
  CollectionBrowser,
  CreateDashboardModal,
  CreateQuestion,
  EditableDashboard,
  InteractiveDashboard,
  InteractiveQuestion,
  MetabaseProvider as SdkMetabaseProvider,
  MetabotQuestion,
  StaticDashboard,
  StaticQuestion,
} from "@metabase/embedding-sdk-react";

/**
 * In production, the Metabase host endows React + SDK components on
 * globalThis before evaluating the bundle. In dev, this module mirrors
 * that setup using the real SDK package, so the same App.jsx source
 * works in both modes without #if dev/prod branches.
 *
 * MetabaseProvider is wrapped so the bundle's call
 *   <MetabaseProvider theme={...}>…</MetabaseProvider>
 * stays auth-agnostic — the authConfig is injected here from .env.local.
 */
const authConfig = {
  metabaseInstanceUrl: import.meta.env.VITE_MB_URL,
  apiKey: import.meta.env.VITE_MB_API_KEY,
};

function MetabaseProvider({ theme, children }) {
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
```

### `src/dev.jsx` — dev entry

```jsx
import "./dev-globals";

import { createRoot } from "react-dom/client";

import App from "./App";

createRoot(document.getElementById("root")).render(<App />);
```

The `import "./dev-globals"` line is intentionally the first statement so all `globalThis.*` assignments run before `App.jsx` evaluates and reads them.

### `src/App.jsx` — starter

```jsx
// SDK components are endowed on globalThis by the host in production and
// by src/dev-globals.jsx in dev. Read them at module load time — when this
// module evaluates, the endowments are already in place.
const { MetabaseProvider, StaticQuestion } = globalThis;

const sdkTheme = {
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
          <p style={{ color: "#555" }}>Edit src/App.jsx to begin.</p>
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

A Metabase data-app authored as a Vite + React + JSX project.

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
# …iterate on src/App.jsx and friends; HMR reloads on save…
yarn build    # produces dist/index.js
```

## Source conventions

### 1. Write normal JSX.

The source is plain ESM + JSX:

```jsx
// src/components/PokemonCard.jsx
const { StaticQuestion } = globalThis;

export default function PokemonCard({ pokemon }) {
  return (
    <article style={{ /* … */ }}>
      <h3>{pokemon.name}</h3>
      <StaticQuestion questionId={pokemon.questionId} height={300} width="100%" />
    </article>
  );
}
```

### 2. Multiple files are encouraged

Split components, helpers, data into separate files in `src/`. Vite bundles everything in `src/` reachable from `src/index.jsx` into a single `dist/index.js` IIFE.

```
src/
├── index.jsx
├── App.jsx
├── components/
│   ├── Hero.jsx
│   ├── PokemonCard.jsx
│   └── TypePill.jsx
├── data/
│   └── pokemon.js
└── theme.js
```

### 3. Read SDK components from `globalThis`, NOT from `@metabase/embedding-sdk-react`

In source code, **never import from `@metabase/embedding-sdk-react`**. The SDK is bundled into the host page and exposed on `globalThis`. Importing the npm package would inline a second copy into your bundle — bigger output, broken contexts, separate Redux store.

```jsx
// ✅ correct
const { MetabaseProvider, StaticQuestion } = globalThis;

// ❌ wrong — bundles a second SDK copy
import { MetabaseProvider, StaticQuestion } from "@metabase/embedding-sdk-react";
```

Only `src/dev-globals.jsx` imports from the SDK package, and only for the dev-mode preview — `dev-globals.jsx` is never reached from `src/index.jsx`, so it's tree-shaken out of the production build.

### 4. `React` is in scope automatically

Vite's JSX classic runtime compiles `<div/>` to `React.createElement("div")`. The bundle externalizes `react` and maps it to `globalThis.React` (the host's React). You don't need to `import React from "react"` in every file — but doing so is harmless and matches normal React habits. **Do not** use `import { useState } from "react"` for hooks — pull them off the global React: `const { useState } = globalThis.React;`. (You can also `import React from "react"; const { useState } = React;` — same result.)

### 5. Production entry exports the factory

`src/index.jsx` is the production entry. It must `export default` a factory function returning `{ component }`:

```jsx
import App from "./App";

export default function factory(_hostApi) {
  return { component: App };
}
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

Network APIs (`fetch`, `XMLHttpRequest`, `WebSocket`, etc.) are blocked by the sandbox in production. Never make direct network requests from the bundle — let the SDK components do the talking.

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
| Bundle is huge (multi-MB). | Imported `@metabase/embedding-sdk-react` in `src/App.jsx` or another non-dev file. | Switch to `globalThis.X` lookups; SDK imports belong only in `src/dev-globals.jsx`. |
| `dist/index.js` doesn't assign anything to `__customVizPlugin__`. | Lib mode `name` not set in vite.config. | Verify `lib.name: "__customVizPlugin__"` in `vite.config.ts`. |
| Preview tab is blank, console says `MetabaseProvider is undefined`. | `src/App.jsx` runs before `src/dev-globals.jsx` evaluates. | Make sure `src/dev.jsx` does `import "./dev-globals"` BEFORE `import App from "./App"`. |

## Where to go next

Once the project files are in place (whether freshly scaffolded or detected
as existing):

1. **Confirm what the data app should do.** If the user hasn't already
   described the screen / charts / flow, ask before generating code.
2**Write the app.** Edit `src/App.jsx` and split additional pieces into
   `src/components/*.jsx` — Vite bundles all of `src/` reachable from
   `src/index.jsx` into a single `dist/index.js`, so file count is free.
3**Iterate in the preview** at `http://localhost:5174` (`yarn dev`). HMR
   reloads on save.
4**Ship.** Run `yarn build` to produce `dist/index.js`, then upload that
   file via Admin → Data apps.
