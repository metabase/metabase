---
name: create-data-app
description: Scaffold a new Metabase data-app development project by cloning the `metabase-data-app-template` GitHub repo. Use when the user asks to start, create, scaffold, or set up a data-app from scratch.
---

# Create a Metabase Data App

A Metabase **data-app** is a single JS bundle that the host loads inside a Near Membrane sandbox and renders inside its own React tree. The scaffold is a Vite + React + TypeScript project: source under `src/`, a dev server with HMR that previews the app against a real Metabase via the Embedding SDK, and `npm run build` producing a single `dist/index.js` to upload via Admin → Data apps.

**The scaffold itself lives in a separate GitHub repo: [`metabase/metabase-data-app-template`](https://github.com/metabase/metabase-data-app-template).** This skill clones that template and then guides the agent through the customization + first-app-content steps — it never generates project files from scratch. If you find yourself writing `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/index.tsx`, or `src/dev.tsx` by hand, stop — clone the template instead.

## When to invoke this skill

- "scaffold a new data app" / "create a Metabase data app" / "set up a data-app project"
- Starting a fresh agent task that will produce a data-app bundle.

### Detecting an existing project

Before cloning, look for an existing data-app project. Surface signs (one of):
`src/index.tsx`, `vite.config.ts` with `name: "__dataAppFactory__"`, or
`package.json` depending on `@metabase/embedding-sdk-react` with a `vite build`
script.

If any surface sign is present, verify the project matches the current
`metabase-data-app-template`. Check **all** of:

1. `vite.config.ts` externals include `"react"`, `"react/jsx-runtime"`,
   `"@metabase/embedding-sdk-react"`, `"@metabase/embedding-sdk-react/data-app"`
   with corresponding `output.globals` (`React`, `__react_jsx_runtime__`,
   `__metabase_sdk__`, `__metabase_data_app__`).
2. `src/index.tsx`'s factory returns `{ component, theme }` (no args).
3. `src/dev.tsx` wraps in the SDK's `<MetabaseProvider authConfig={…}>`.

**All checks pass** → template-shaped. Ask: "Extend this one, or scaffold fresh
elsewhere?" If extend → skip the clone step, edit `src/`. If fresh → ask for a
target path, clone there.

**Any check fails** → not template-shaped (older scaffold or drift). **Stop.**
Tell the user the structure differs from the current template, extending it
risks breaking the bundle contract, and ask whether to (1) migrate it, (2)
scaffold fresh and port the code over, or (3) proceed anyway at their risk.
Wait for the answer.

Never overwrite existing files without explicit confirmation.

## Step 1 — Clone the template

Source: `metabase/metabase-data-app-template`. Any GitHub remote created should
be **private**.

- **Empty CWD** → clone in-place via `degit` (no name to ask for, no remote
  created — user can add one later). Make an initial git commit afterwards.
- **Non-empty CWD** → ask the user for a target directory name (e.g.
  `sales-app`). Prefer `gh repo create --template … --private --clone` so a
  private GitHub remote is wired up at the same time. Fall back to `degit` (no
  remote) if `gh` isn't available.

## Step 2 — Customize

Once the template is on disk:

1. Edit `package.json` `name` to match the project folder.
2. Pin `@metabase/embedding-sdk-react` to the target Metabase version (e.g. `"^63.0.0"`) — the template ships with `*`. v63 is the floor; earlier versions don't ship the data-app contract surface.
3. Copy `.env.local.example` → `.env.local` and fill in `VITE_MB_URL` (the running Metabase instance) and `VITE_MB_API_KEY` (Admin → Authentication → API keys).
4. `npm install` (or whichever package manager the user prefers — the template ships with no lockfile, so `npm` / `yarn` / `pnpm` / `bun` all work; use the project's existing lockfile if one appears post-clone). After install succeeds, **strip the lockfile-ignoring block from `.gitignore`** — the template ignores `package-lock.json` / `yarn.lock` / `pnpm-lock.yaml` / `bun.lock*` to stay PM-agnostic, but the downstream project wants its lockfile committed for reproducible installs.
5. `npm run dev` and confirm the preview at http://localhost:5174 renders the starter "Hello, data app" message.
6. If the preview hits CORS, add `http://localhost:5174` under Admin → Embedding → Embedded analytics SDK → CORS.

## Step 3 — Confirm what the app should do

Before writing a single component, confirm the app's scope with the user. If they haven't described the screens, data, or flow, **ask first**:

- What are the screen(s) and the rough layout? (single screen, multi-page, etc.)
- Which Metabase questions, dashboards, or data sources drive each screen?
- Any specific interactions (filters, drill-downs, write-back via actions)?
- Branding / theme constraints?

## Step 4 — Write the actual app

Replace `src/App.tsx`'s starter content with the screens the user described. **Structure the project properly from the start** — don't stuff everything into `App.tsx`. Each screen/page becomes its own file under `src/pages/` (or wherever fits the app's shape), shared UI lives in `src/components/`, data-fetching hooks in `src/hooks/`, derived/computed helpers in `src/lib/`, types in `src/types/`. `App.tsx` should end up small: routing + composition of the page components, not implementation. Vite bundles everything reachable from `src/index.tsx` into the one IIFE.

**Do not modify `src/index.tsx`, `src/dev.tsx`, `vite.config.ts`, `tsconfig.json`, or `index.html` unless the change is genuinely required.** They encode the bundle contract with the host (factory shape, externals, document shell). Tweaks here drift the dev preview from production — the iframe doesn't read your `index.html`, the host serves a byte-for-byte template — and silently break things like drill popups and routing.

**After every meaningful round of edits, run `npm run typecheck`.** It runs `tsc --noEmit` over `src/` and `vite.config.ts` — catches wrong prop shapes against the SDK types, broken refactors, missing imports, etc. The Vite dev server does NOT typecheck (it only transpiles), so errors that would fail a production CI run can sit invisibly in a passing `npm run dev` session. Run it before declaring a task complete.

## Source conventions

### 1. Write TSX

Plain ESM + TSX, normal package imports:

```tsx
// src/components/CustomerCard.tsx
import { StaticQuestion } from "@metabase/embedding-sdk-react";

type Customer = { name: string; questionId: number };

export default function CustomerCard({ customer }: { customer: Customer }) {
  return (
    <article>
      <h3>{customer.name}</h3>
      <StaticQuestion questionId={customer.questionId} height={300} width="100%" />
    </article>
  );
}
```

### 2. Structure from the start

Default project layout (see Step 4 for the principle — don't dump everything into `App.tsx`):

```
src/
├── index.tsx          (template — don't edit)
├── dev.tsx            (template — don't edit)
├── App.tsx            (routing + composition only)
├── theme.ts
├── pages/             (one file per screen)
│   ├── Overview.tsx
│   └── CustomerDetail.tsx
├── components/        (shared UI)
│   └── Card.tsx
├── hooks/             (data-fetching wrappers, custom hooks)
│   └── useCustomers.ts
├── lib/               (pure helpers / derivations)
│   └── format.ts
└── types/             (shared TS types)
    └── customer.ts
```

Vite bundles everything reachable from `src/index.tsx` into a single `dist/index.js` IIFE — the folder layout is purely for your own readability.

### 3. Import SDK values from `@metabase/embedding-sdk-react` directly

`vite.config.ts` externalizes `@metabase/embedding-sdk-react` and `@metabase/embedding-sdk-react/data-app`, so production maps them to host-realm globals (`__metabase_sdk__` / `__metabase_data_app__`); the Vite dev server resolves them to the real npm package.

```tsx
// ✅ correct
import { StaticQuestion, useQuestionQuery } from "@metabase/embedding-sdk-react";
import { DataAppRouter, DataAppLink } from "@metabase/embedding-sdk-react/data-app";

// ❌ wrong — no globalThis pattern; you'd be reading nothing
const { MetabaseProvider, StaticQuestion } = globalThis;
```

**Do NOT render `<MetabaseProvider>` in `App.tsx`.** The dev entry (`src/dev.tsx`) and the production host both wrap your tree in a provider that lives in their own realm — wrapping inside the bundle would route the SDK's `setState`-via-listener paths through the Near Membrane sandbox and silently break drill popups, plugin init, and similar.

### 4. Import `react` normally too

`vite.config.ts` externalizes `react` (mapped to `globalThis.React`), so a plain `import` resolves to the host's React in production and the npm package in dev:

```tsx
import { useState, useEffect, useMemo } from "react";
```

**No `import React from "react"` needed in TSX files** — the template uses the automatic JSX runtime (`jsx: "react-jsx"` in `tsconfig.json`, `react()` plugin default in `vite.config.ts`). The compiler injects the `react/jsx-runtime` imports it needs. Just write JSX and named imports — that's it.

For React *types* (e.g. `ComponentType`, `ReactNode`, `RefObject`), use named type imports rather than the `React.` namespace:

```ts
import type { ComponentType, ReactNode } from "react";
```

## Theme rules

`MetabaseProvider`'s `theme` (defined in `src/theme.ts`) is the only way SDK component appearance changes. It is NOT a stylesheet for the bundle's own chrome.

| Field | Purpose | Notes |
|---|---|---|
| `colors.brand`, `colors.brand-hover` | Accent for SDK widgets | Use the data app's primary color. |
| `colors.charts` | Chart palette | Array of strings. Use vivid brand-shade colors only; **never pale tints** — palette index 1+ may render labels and pale-on-white is invisible. |
| `colors.positive` / `colors.negative` | Semantic indicators | |
| `colors.background`, `colors.background-secondary` | SDK component surface | **MUST match the immediate parent container of the SDK component.** If the chart sits inside a white card, use `"white"`. If it sits on a tinted page, use that tint. |
| `colors.text-primary`, `text-secondary`, `text-tertiary` | Text on SDK surfaces | **MUST contrast with `background`.** For white bg: use `#1f2937` or similar dark color. The SDK's default `text-primary` resolves to ~white, so leaving it unset on a white surface produces invisible white text. **Always pair `background` and `text-primary` when overriding.** |
| `fontFamily` | SDK widget typography | |

**The theme only styles SDK widgets — never your own UI.** For your page background, headers, card wrappers, etc., use inline `style={{ background: "#f5f5f7" }}` or CSS modules on your own elements.

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
- **Window / history navigation** (`window.open`, `history.pushState`, `history.replaceState`) → `useDataAppLocation().navigate` for in-app, `<a target="_blank" rel="noopener">` for external.
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

1. `npm run build` → produces `dist/index.js`.
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
| "Invalid hook call" at runtime. | `react` not externalized — the template ships with this configured; check you didn't edit `vite.config.ts`. |
| Bundle is multi-MB. | One of `react`, `@metabase/embedding-sdk-react`, or `@metabase/embedding-sdk-react/data-app` was removed from `vite.config.ts`'s `external` — restore from the template. |
| `dist/index.js` doesn't assign to `__dataAppFactory__`. | `lib.name: "__dataAppFactory__"` got removed from `vite.config.ts` — restore from the template. |
| Dev preview blank, console says `MetabaseProvider is undefined`. | `src/dev.tsx` got edited and lost the `<MetabaseProvider authConfig={…}>` wrap. |
| `Cannot find module '@metabase/embedding-sdk-react'`. | Run `npm install` (or the equivalent for your package manager). Types come from the package directly. |
| Drill popups don't open / SDK components show empty / "MetabaseProvider not found" at runtime in dev. | `src/dev.tsx` is missing the `<MetabaseProvider authConfig={…}>` wrap. The bundle's `App.tsx` does NOT include `MetabaseProvider` — `dev.tsx` provides it. |
| URL changes but UI doesn't update in production (works in dev). | `vite.config.ts` is missing `@metabase/embedding-sdk-react/data-app` in `external` / `output.globals`. Without it, the data-app routing primitives get inlined into the bundle and the React-state-batching-through-Near-Membrane bug breaks navigation re-renders. Restore from the template. |
