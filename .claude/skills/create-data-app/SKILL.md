---
name: create-data-app
description: Scaffold a new Metabase data-app development project by cloning the `data-app-template` GitHub repo. Use when the user asks to start, create, scaffold, or set up a data-app from scratch.
---

# Create a Metabase Data App

A Metabase **data-app** is a single JS bundle that the host loads inside a Near Membrane sandbox and renders inside its own React tree. The scaffold is a Vite + React + TypeScript project: source under `src/`, a dev server with HMR that previews the app against a real Metabase via the Embedding SDK, and `npm run build` producing a single `dist/index.js` to upload via Admin → Data apps.

**The scaffold itself lives in a separate GitHub repo: [`metabase/data-app-template`](https://github.com/metabase/data-app-template).** This skill clones that template and then guides the agent through the customization + first-app-content steps — it never generates project files from scratch. If you find yourself writing `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/index.tsx`, or `src/dev.tsx` by hand, stop — clone the template instead.

## When to invoke this skill

- "scaffold a new data app" / "create a Metabase data app" / "set up a data-app project"
- Starting a fresh agent task that will produce a data-app bundle.

### Detecting an existing project

Before cloning, look for an existing data-app project. Surface signs (one of):
`src/index.tsx`, `vite.config.ts` with `name: "__dataAppFactory__"`, or
`package.json` depending on `@metabase/embedding-sdk-react` with a `vite build`
script.

If any surface sign is present, verify the project matches the current
`data-app-template`. Check **all** of:

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

Source: `metabase/data-app-template`. Any GitHub remote created should
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
4. `npm install` (or whichever package manager the user prefers — the template ships with no lockfile, so `npm` / `yarn` / `pnpm` / `bun` all work; use the project's existing lockfile if one appears post-clone).
5. **Strip the lockfile-ignoring block from `.gitignore`.** The template ignores `package-lock.json` / `yarn.lock` / `pnpm-lock.yaml` / `bun.lock` / `bun.lockb` plus the leading comment block (the chunk between `# Lockfiles —` and `bun.lockb`). The block has to go so the downstream project commits its lockfile for reproducible installs. **Verify with `git status`** — the lockfile your package manager just generated must now appear as a new untracked file. If it doesn't, the block is still in `.gitignore`; remove it and re-check. Do **not** skip this step or defer it to "later"; agents have repeatedly forgotten and shipped projects with no committed lockfile.
6. `npm run dev` and confirm the preview at http://localhost:5174 renders the starter "Hello, data app" message.
7. If the preview hits CORS, add `http://localhost:5174` under Admin → Embedding → Embedded analytics SDK → CORS.

## Step 3 — Pull the typed schema

Generate `src/metabase.data.ts` by invoking the
[`metabase-semantic-schema-data-apps`](../metabase-semantic-schema-data-apps/SKILL.md)
skill. It prompts the user for an API key, hits
`/api/typed-schemas/v1/typescript` on the target Metabase, and writes the file.

The schema is the **single source of truth** for what data the app can render. Every saved question, table, metric, segment, measure, and field the app references must come from it (`schema.questions.<name>`, `schema.tables.<t>.fields.<f>`, `schema.metrics.<m>.dimensions.<d>`, etc.). Never copy numeric IDs into constants; never invent fields the schema doesn't have. Re-run the schema skill whenever the upstream semantic layer changes (new question, renamed metric, added column).

This step is mandatory before Step 4 — the schema is the catalog you'll check the user's brief against, and the agent needs it loaded into context before discussing what the app should do.

## Step 4 — Confirm what the app should do

Before writing a single component, confirm the app's scope with the user **and check it against the schema you just pulled**. If they haven't described the screens, data, or flow, ask first:

- What are the screen(s) and the rough layout? (single screen, multi-page, etc.)
- Which Metabase questions, dashboards, or data sources drive each screen?
- Any specific interactions (filters, drill-downs, write-back via actions)?
- Branding / theme constraints?

**Schema-matching rule.** Every entity the user references should map to something in `src/metabase.data.ts`:

- **Match exists** → confirm what you found by name. Example: "Your schema has `schema.questions.overview_revenue` and `schema.tables.customers` with the `lifetime_value` measure — is that what you want me to use?"
- **Topic doesn't match** → don't fabricate. Push back: explain the schema doesn't expose anything for that topic, and ask whether to (1) add it upstream in the Metabase semantic layer first and re-run Step 3, (2) pick a different topic that's already curated, or (3) ship the app without that part. **Don't invent mock data. Don't create new questions from inside the app.** The schema is curated upstream; the app is presentation only.

## Step 5 — Write the actual app

Replace `src/App.tsx`'s starter content with the screens the user described. **Structure the project properly from the start** — don't stuff everything into `App.tsx`. Each screen/page becomes its own file under `src/pages/` (or wherever fits the app's shape), shared UI lives in `src/components/`, data-fetching hooks in `src/hooks/`, derived/computed helpers in `src/lib/`, types in `src/types/`. `App.tsx` should end up small: routing + composition of the page components, not implementation. Vite bundles everything reachable from `src/index.tsx` into the one IIFE.

**Reference Metabase data through the schema, never with raw IDs.** Import `schema` from `src/metabase.data.ts` and pass `schema.questions.<name>.id`, `schema.tables.<t>.id`, `schema.metrics.<m>.id` to the data hooks. For query patterns (typed row shapes, `useMetabaseQuery` generics, segments / measures / breakouts, debugging), follow the `metabase-semantic-schema-data-apps` skill — it owns the data-side conventions; this skill owns the project-side conventions.

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
import { StaticQuestion, useMetabaseQuery } from "@metabase/embedding-sdk-react";
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
| `useMetabaseQuery` | Schema-backed data-fetching hook for questions / tables / metrics. **The `metabase-semantic-schema-data-apps` skill owns the full hook contract** — signature, generics, table-vs-metric variants, segments / measures / breakouts, debugging. Don't reinvent its rules here. |
| `useQuestionQuery` | Question-only data-fetching hook (`useQuestionQuery(questionId, options?)` returning `{ data, isLoading, error, refetch }`). The bare numeric id is the first arg; optional `{ initialSqlParameters?, enabled? }` is the second. Must be called under `<MetabaseProvider>`. Use when you need a quick question fetch without going through the schema layer (e.g. ad-hoc tooling, pre-schema apps); prefer `useMetabaseQuery` for new schema-backed work. |

### Blocked APIs

The Near Membrane sandbox throws at runtime on these globals. Use the endowed alternative instead:

- **Network** (`fetch`, `XMLHttpRequest`, `WebSocket`) → the data hooks for reads, `useAction` for writes. No raw network from the bundle, ever.
- **UI dialogs** (`alert`, `confirm`, `prompt`) → render a React modal in your own tree.
- **Storage** (`localStorage`, `sessionStorage`, `indexedDB`, `document.cookie`) → treat the Data App as stateless across reloads; persist via a Metabase action.
- **Window / history navigation** (`window.open`, `history.pushState`, `history.replaceState`) → `useDataAppLocation().navigate` for in-app, `<a target="_blank" rel="noopener">` for external.
- **`navigator.*` device APIs** (`clipboard`, `geolocation`, etc.) → not available.
- **Global event listeners on `document` / `window`** for typing or clipboard events (`keydown`, `keyup`, `keypress`, `beforeinput`, `input`, `paste`, `copy`, `cut`, `before*paste/copy/cut`, `compositionstart/update/end`, `storage`) → attach the listener to your own element instead, or use the React event handler (`onKeyDown`, `onPaste`, …) on the specific input/container that needs it. Same listener on a script-owned element still works.

**Rule of thumb:** if you're about to touch `window.X`, `document.X`, `navigator.X`, `history.X`, or any storage global, stop and pick the endowed replacement above. The endowed surface (React + SDK components + data hooks + `useAction` + DataAppRouter) covers every routine need; anything outside it is intentionally unreachable.

### When to use `useMetabaseQuery` vs a `StaticQuestion` / `InteractiveQuestion`

This is a per-rendering decision, not a project-wide one:

- **`StaticQuestion` / `InteractiveQuestion`** — only when a stock Metabase chart, displayed as-is, IS the deliverable. No custom layout the chart has to integrate with, no derived/aggregated values pulled out, no per-row UI, no bespoke list/grid/card pattern. The SDK widget renders its own chrome and sizing — take it or leave it.
- **`useMetabaseQuery`** — whenever **any** of the following applies, even slightly: rendering as something other than the saved question's viz type (stat tile, custom table, grid, sparkline, anything bespoke); reading a single value out of the result; driving your own state or other components from the rows; formatting / transforming / grouping rows before display; custom empty/loading/error states; or making the data layout match the bundle's chrome.

**Default to `useMetabaseQuery`.** Reach for `StaticQuestion` / `InteractiveQuestion` only when the saved-question chart with its own framing is exactly what the user asked for. The moment they want "something custom" — even subtle, even just "show the count nicely" — switch to the hook.

**Always render a spinner (or skeleton) while `isLoading` is `true`** — never an empty slot or stale value, which causes layout shift when the data arrives. Same rule for lifted / derived queries (pass `isLoading` down) and for `useAction`'s `isExecuting` (spinner in the button + `disabled={isExecuting}`).

**Call each schema entry at most once per render tree.** Multiple `useMetabaseQuery` calls on the same `questionId` (or same `tableId` + identical filters/measures/breakouts) mount independent subscriptions, fire duplicate queries, and let consumers disagree mid-load. Lift the call to the highest component that needs the data; pass `data` / `isLoading` / `error` down as props. Different ids — or the same id with different filters / breakouts — are different data sources; call them separately.

(For the hook contract itself — generics, table-vs-metric variants, segments / measures / breakouts, debugging — see the `metabase-semantic-schema-data-apps` skill.)

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
