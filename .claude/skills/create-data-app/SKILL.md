---
name: create-data-app
description: Scaffold a new Metabase data-app development project — a small Vite preview environment plus a starter `index.js` bundle, with all conventions for plain-JS / React.createElement bundles and Embedding-SDK theming. Use when the user asks to start, create, scaffold, or set up a data-app or data-app bundle from scratch.
---

# Create a Metabase Data App

A Metabase **data-app** is a single hand-written JS file (`index.js`) that the host loads inside a Near Membrane sandbox and renders inside its own React tree. The agent's job is to author that one file. This skill scaffolds a small dev project that gives you a local preview with real SDK rendering and hot-reload, plus a starter bundle that demonstrates every convention.

## When to invoke this skill

- "scaffold a new data app", "create a Metabase data app", "set up a data-app project"
- The user mentions building a data app and there's no existing project structure
- You're starting a fresh agent task that will produce a data-app bundle

If a `public/index.js` already exists in the working directory, **don't re-scaffold** — edit the existing bundle instead.

## What gets created

```
<project-root>/
├── package.json
├── vite.config.ts
├── index.html
├── preview.tsx          ← host shim that mimics what Metabase does in-host
├── public/
│   └── index.js         ← the data-app bundle — the ONLY file you edit going forward
├── .env.local.example   ← copy to .env.local, fill in Metabase URL + API key
├── .gitignore
└── README.md
```

The preview imports `@metabase/embedding-sdk-react`, puts `React` + SDK components onto `globalThis`, fetches `/index.js` as text, evaluates it, and renders the returned component. The wiring mirrors how Metabase loads data apps in-host, so what you see locally is what users see post-upload.

## Step 1 — Project files (write these verbatim)

### `package.json`

```json
{
  "name": "data-app",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "vite --port 5174"
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

Pin the `@metabase/embedding-sdk-react` version to match the target Metabase. `*` is fine for local dev.

### `vite.config.ts`

```ts
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "watch-bundle",
      configureServer(server) {
        const bundle = resolve(__dirname, "public/index.js");
        server.watcher.add(bundle);
        server.watcher.on("change", (path) => {
          if (path === bundle) {
            // Vite's HMR doesn't watch /public; emit a manual full-reload.
            server.ws.send({ type: "full-reload" });
          }
        });
      },
    },
  ],
  server: { port: 5174, host: "localhost" },
});
```

Vite normally doesn't watch `public/`. The tiny inline plugin watches `public/index.js` and triggers a full reload on save so the preview always reflects the latest bundle.

### `index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Data App Preview</title>
    <style>
      html, body, #root { height: 100%; margin: 0; }
      body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/preview.tsx"></script>
  </body>
</html>
```

### `preview.tsx`

```tsx
import * as React from "react";
import { createRoot } from "react-dom/client";
import {
  InteractiveQuestion,
  MetabaseProvider as SdkMetabaseProvider,
  StaticQuestion,
  type MetabaseAuthConfig,
} from "@metabase/embedding-sdk-react";

const authConfig: MetabaseAuthConfig = {
  metabaseInstanceUrl: import.meta.env.VITE_MB_URL,
  apiKey: import.meta.env.VITE_MB_API_KEY,
};

function MetabaseProviderShim({ theme, children }: any) {
  return (
    <SdkMetabaseProvider authConfig={authConfig} theme={theme}>
      {children}
    </SdkMetabaseProvider>
  );
}

(globalThis as any).React = React;
(globalThis as any).MetabaseProvider = MetabaseProviderShim;
(globalThis as any).StaticQuestion = StaticQuestion;
(globalThis as any).InteractiveQuestion = InteractiveQuestion;

async function boot() {
  const root = createRoot(document.getElementById("root")!);

  if (!authConfig.metabaseInstanceUrl || !authConfig.apiKey) {
    root.render(
      <div style={{ padding: 24, fontFamily: "monospace" }}>
        <h2>Missing env</h2>
        <p>Set <code>VITE_MB_URL</code> and <code>VITE_MB_API_KEY</code> in <code>.env.local</code>, then restart.</p>
      </div>
    );
    return;
  }

  const code = await fetch("/index.js", { cache: "no-store" }).then(r => r.text());
  // eslint-disable-next-line no-new-func
  new Function(code)();

  const factory = (globalThis as any).__customVizPlugin__;
  if (typeof factory !== "function") {
    root.render(<pre>Bundle did not assign a function to __customVizPlugin__</pre>);
    return;
  }
  const def = factory({});
  const App = def.component;
  root.render(<App />);
}

boot();
```

This shim mirrors what Metabase's in-host sandbox does — endow React + SDK components, evaluate the bundle, render. Locally it uses the real SDK with API-key auth.

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

A hand-written Metabase data-app bundle. The single file the agent edits is
**`public/index.js`** — plain JS, no JSX, no build step.

## Setup

```bash
bun install
cp .env.local.example .env.local
# fill in VITE_MB_URL and VITE_MB_API_KEY (Admin → API keys)
bun run dev
```

Open http://localhost:5174.

## CORS

The SDK on `:5174` calls Metabase on a different origin. In Admin →
Embedding, add `http://localhost:5174` to the SDK origins allowlist.
```

## Step 2 — The starter `public/index.js`

Write this as the initial bundle. It demonstrates every convention. Modify it (or replace it) to build the actual app.

```js
"use strict";
// Data-app bundle. Plain JS, no JSX, no imports, no build step.
// The host evaluates this text inside a Near Membrane sandbox and renders the
// returned component inside its own React tree.
//
// Host-injected globals:
//   - React               the host's React instance
//   - MetabaseProvider    SDK provider — wrap the whole app once; pass `theme`
//   - StaticQuestion      SDK static (non-drillable) question
//   - InteractiveQuestion SDK drillable question
(function () {
  // Convenience helper for React.createElement. Read React from globalThis
  // inside the function (lazy) — robust to endowment ordering, and the
  // .apply(React, arguments) forwards `el(type, props, ...children)`
  // identically to createElement's signature.
  function el() {
    var React = globalThis.React;
    return React.createElement.apply(React, arguments);
  }

  function Hero(props) {
    return el(
      "header",
      { style: { padding: 24, marginBottom: 16 } },
      el("h1", { style: { margin: 0, fontSize: 28 } }, props.title),
      el("p", { style: { margin: "4px 0 0", color: "#555" } }, props.subtitle),
    );
  }

  function Chart(props) {
    var StaticQuestion = globalThis.StaticQuestion;
    return el(
      "div",
      {
        style: {
          background: "white",
          border: "1px solid #eee",
          borderRadius: 12,
          padding: 16,
          margin: 24,
        },
      },
      el(
        "div",
        { style: { height: 360, overflow: "hidden" } },
        el(StaticQuestion, {
          questionId: props.questionId,
          withChartTypeSelector: false,
          // SDK components don't auto-fit their parent — pass explicit dims.
          height: "100%",
          width: "100%",
        }),
      ),
    );
  }

  function App() {
    var React = globalThis.React;
    var MetabaseProvider = globalThis.MetabaseProvider;

    // The theme is the SDK's contract. Tune fields the SDK consumes; match
    // `background` / `text-primary` to the IMMEDIATE PARENT of the chart
    // (here it's the white Chart card — so white bg + dark text).
    var sdkTheme = {
      colors: {
        brand: "#4D96FF",
        "brand-hover": "#4D96FF",
        positive: "#4D96FF",
        charts: ["#4D96FF"],
        background: "white",
        "background-secondary": "white",
        "text-primary": "#1f2937",
        "text-secondary": "#4b5563",
        "text-tertiary": "#6b7280",
      },
      fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
    };

    return el(
      MetabaseProvider,
      { theme: sdkTheme },
      el(
        "div",
        { style: { minHeight: "100vh", background: "#f5f5f7" } },
        el(Hero, { title: "Hello, data app", subtitle: "Edit public/index.js to begin." }),
        el(Chart, { questionId: 1 }),
      ),
    );
  }

  // Factory handshake. The host reads this back through an accessor pair and
  // calls factory(hostApi), then renders def.component.
  globalThis.__customVizPlugin__ = function factory(_hostApi) {
    return { component: App };
  };
})();
```

## Step 3 — Install and run

```bash
bun install   # or npm install
cp .env.local.example .env.local
# edit .env.local with the user's Metabase URL + API key
bun run dev
```

Open `http://localhost:5174`. Edit `public/index.js`; the page reloads on every save.

## Bundle conventions — what every `index.js` MUST follow

### 1. `"use strict";` and IIFE wrapper

```js
"use strict";
(function () {
  // …everything…
})();
```

Bundle is evaluated as text — no module system. The IIFE keeps internal symbols private; strict mode catches typos.

### 2. The `el` helper

```js
function el() {
  var React = globalThis.React;
  return React.createElement.apply(React, arguments);
}
```

Critical properties:

- **`globalThis.React` read inside the function (lazy)**. `React` is an endowment placed on the sandbox's globalThis by the host. Reading it eagerly at IIFE top would also work in practice, but lazy reads are robust to any ordering surprise and don't cost anything.
- **`.apply(React, arguments)` forwards all args verbatim**. Same call signature as `createElement`:
  - `el(type, props, ...children)` for DOM tags and components.
  - `el("div", { style: { …inline styles… } }, …)` for native elements.
  - `el(Component, propsObject)` for components without children.
  - `el(Component, null, "text")` when children are primitives.
- **Two letters**. The bundle is mostly `el(...)` calls; brevity matters.

Use `el` for *everything* that would be `<JSX>` in a normal app. Never write `React.createElement` directly in the bundle body — `el` is the convention readers expect.

### 3. No JSX, no imports, no module syntax

- No `import` / `export` — the bundle is evaluated via `new Function(code)()` in the preview and via the membrane in-host. Neither supports ES modules.
- No JSX — there's no transpiler running over this file. `el(...)` is the only way to express React elements.
- No top-level `await`.

### 4. Function components only

```js
function MyComponent(props) {
  var React = globalThis.React;
  var s = React.useState(0);
  // …
  return el("div", null, "…");
}
```

- Function components, never class components.
- Inside any function that uses hooks, capture `var React = globalThis.React;` at the top so `React.useState`, `React.useEffect`, etc. are reachable.
- All stock hooks work — they dispatch through the host React reached via the membrane.

### 5. `MetabaseProvider` wraps the root

```js
function App() {
  var React = globalThis.React;
  var MetabaseProvider = globalThis.MetabaseProvider;
  return el(MetabaseProvider, { theme: sdkTheme }, /* …app tree… */);
}
```

- **Required**. SDK components (`StaticQuestion`, `InteractiveQuestion`) need the provider to find the SDK Redux store and the theme. Without `MetabaseProvider`, they render nothing or throw.
- **One provider, at the root**. Nesting more `MetabaseProvider`s doesn't give you per-subtree themes — the SDK writes its CSS variables to a single `EnsureSingleInstance` slot. Recompute the theme at the App level when state changes (e.g., on selection) and the whole tree re-themes.

### 6. Factory at the very end

```js
globalThis.__customVizPlugin__ = function factory(_hostApi) {
  return { component: App };
};
```

- Last statement before the IIFE closes.
- Must return `{ component }` — the host invokes the factory once and renders `def.component` as a normal React component.
- `hostApi` is reserved for future use (data API, asset URLs, etc.). Ignore it for now.

## Theme rules

`MetabaseProvider`'s `theme` is the **only** way SDK component appearance changes. It is **not** a stylesheet for the bundle's own chrome.

### Safe to set

| Field | Purpose | Notes |
|---|---|---|
| `colors.brand`, `colors.brand-hover` | Accent for SDK widgets | Use the data app's primary color. |
| `colors.charts` | Chart palette | Array of strings. **Use vivid brand-shade colors only**; never pale tints — palette index 1+ may render labels and pale-on-white is invisible. |
| `colors.positive` / `colors.negative` | Semantic indicators | |
| `colors.background`, `colors.background-secondary` | SDK component surface | **MUST match the immediate parent container of the SDK component.** If the chart sits inside a white card, use `"white"`. If it sits on a tinted page, use that tint. |
| `colors.text-primary`, `text-secondary`, `text-tertiary` | Text on SDK surfaces | **MUST contrast with `background`.** For white bg: use a dark text (`#1f2937`). For dark bg: use light text. The SDK's default `text-primary` resolves to near-white via `--mantine-color-text-primary-0`, so leaving it unset and putting the chart on a white card produces invisible white text. **Always set these explicitly when overriding background.** |
| `fontFamily` | SDK widget typography | |

### Anti-patterns

- **Don't put page-chrome colors in the theme.** The page's outer `background` is NOT what `colors.background` controls — that's the SDK widget background. Style page chrome with inline `style={{ background: '#f5f5f7' }}` on your own `div`s; keep the theme focused on what's inside the SDK widget.
- **Don't include `selected.tint` (or any pale color) in `colors.charts`.** Pale chart palette colors render as labels and become unreadable on light backgrounds.
- **Don't expect per-subtree theming.** Multiple `MetabaseProvider`s on the page fight for the single CSS-variable slot. If you want the look to change with state, recompute `sdkTheme` at the root.

### Why the `text-primary` token is so easy to get wrong

The SDK doc string for `text-primary` reads "Text color on dark elements." In practice the SDK pipes it into `--mantine-color-text-primary-0` and uses it as the primary text token everywhere — irrespective of background. The default value is near-white. So:

- ✅ Dark background, leave `text-primary` unset → SDK default white text → legible.
- ❌ Light background, leave `text-primary` unset → SDK default white text → invisible.
- ✅ Light background, set `text-primary: "#1f2937"` → dark text → legible.

Always pair `background` and `text-primary` in the theme.

## Available endowments

The host puts these on `globalThis` inside the sandbox before evaluating your bundle. Reach them via `globalThis.X` inside component bodies.

| Endowment | Purpose |
|---|---|
| `React` | The host's React instance. Use stock APIs. |
| `MetabaseProvider` | Provider — wraps the root. Takes `{ theme, children }`. |
| `StaticQuestion` | Non-drillable question. Props: `questionId` (required), `withChartTypeSelector?`, `height?`, `width?`. |
| `InteractiveQuestion` | Drillable question. Same props as StaticQuestion plus drill behaviors. |
| `__customVizPlugin__` | Accessor pair — assign your factory to it as the bundle's last statement. |

Anything else (`fetch`, `XMLHttpRequest`, `WebSocket`, etc.) may be blocked by the sandbox in production. **Never make direct network requests from the bundle.** Get data through SDK components only.

## SDK component sizing

SDK components do NOT auto-fit their parent. You must give them explicit dimensions:

```js
el(
  "div",
  { style: { height: 360, overflow: "hidden" } },  // parent must define size
  el(StaticQuestion, {
    questionId: 1,
    height: "100%",   // tell the SDK to fill the parent
    width: "100%",
  }),
)
```

Without `height`/`width` props, the SDK component renders at its intrinsic size, which usually overflows the bundle's layout.

## Dev workflow

1. Edit `public/index.js`.
2. Save. Vite triggers a full reload of `http://localhost:5174`.
3. Bundle is re-fetched as text, re-evaluated, App re-renders inside the preview's `MetabaseProvider`.

The bundle never gets bundled, transpiled, or minified by Vite — it lives in `public/` and is served verbatim. Vite only owns the preview shell.

## Common pitfalls and fixes

| Symptom | Cause | Fix |
|---|---|---|
| Preview shows "Failed to fetch the user, the session might be invalid." | Wrong/missing API key, or CORS blocked. | Verify `curl -H "X-API-Key: $KEY" $URL/api/user/current` returns 200. Add `http://localhost:5174` to Metabase's SDK CORS origins. |
| Chart renders but with invisible labels. | `text-primary` not set against a light `background`. | Set `text-primary: "#1f2937"` (or similar dark color) in the theme. |
| Chart overflows its container. | No `height`/`width` props on SDK component. | Pass `height="100%"` `width="100%"` and constrain the parent. |
| `Bundle did not assign a function to __customVizPlugin__` in preview. | Forgot the factory assignment at end of IIFE. | Add `globalThis.__customVizPlugin__ = function (_hostApi) { return { component: App }; };` |
| Hooks throw "Invalid hook call". | Component defined outside the function-component pattern, or React from globalThis not read. | Use plain `function MyComp(props) { var React = globalThis.React; … }`. |
| `el` is not defined inside a component. | `el` is defined inside the IIFE but not pulled into closure. | `el` is in the IIFE's lexical scope, accessible from any inner function. Don't redeclare. |

## Where to go next

After scaffolding:

1. Replace the starter `Hero` + `Chart` with the actual data app.
2. Find real `questionId`s on the target Metabase (Admin → query the cards table, or eyeball URLs of existing saved questions).
3. Iterate visually in the preview.
4. When upload-to-Metabase exists, ship `public/index.js` through that flow.
