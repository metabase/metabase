---
name: create-data-app
description: Scaffold a new Metabase data-app into the connected remote-sync repository's `data_apps/<app>/` directory from the `data-app-template`. Use when the user asks to start, create, scaffold, or set up a data-app from scratch.
---

# Create a Metabase Data App

A Metabase **data-app** is a single JS bundle that the host loads inside a Near Membrane sandbox and renders inside its own React tree. The scaffold is a Vite + React + TypeScript project: source under `src/`, a dev server that previews the app against a real Metabase **through the same Near Membrane sandbox + distortion rules Metabase uses in production** — so `npm run dev` behaves like production, including for third-party libraries the app bundles — and `npm run build` producing a single `dist/index.js`. (Because the sandbox runs a built bundle, a change rebuilds it and does a *soft reload* — re-evaluates the bundle in the sandbox and remounts the app, keeping auth/SDK loaded — rather than hot-swapping modules; component state resets, but there's no full browser refresh.)

**Data apps are served from Git, not uploaded.** A single repository is connected to Metabase via remote-sync (Admin → Settings → Remote sync). Each app lives in its own directory `data_apps/<app>/` inside that repo — its source, a `data_app.yml` (name/slug/path), and the committed built bundle at the `path` its `data_app.yml` declares (`dist/index.js` by default). On each remote-sync import Metabase materializes one app per directory and serves it at `/data-app/<slug>`. So this skill always scaffolds **into the connected repo's `data_apps/<app>/` directory**, never as a standalone project.

**The scaffold ships inside this skill at `./template/`** — a Vite + React + TypeScript project that was installed alongside the skill. Step 3 just copies it into the app directory; the skill then guides you through the customization + first-app-content steps — it never generates project files from scratch. If you find yourself writing `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/index.tsx`, or `src/dev.tsx` by hand, stop — copy the template instead.

## When to invoke this skill

- "scaffold a new data app" / "create a Metabase data app" / "set up a data-app project"
- "I want to build a data app" / any vague intent to author a data app
- Starting a fresh agent task that will produce a data-app bundle.
- Do **not** use this skill for an existing data-app project when the task is to
  build screens, use Metabase data, generate or refresh schema files, wire saved
  questions / tables / metrics / actions, add filters, or author data hooks.
  Treat those as existing-data-app editing tasks and use the agent's normal
  skill-discovery flow from the user's wording.

## Step 1 — Locate the remote-sync repository

Data apps live inside the Git repository connected to Metabase via remote-sync. Find it before scaffolding:

- Ask: **"Do you already have a Git repository connected to this Metabase via remote-sync?"**
  - **Yes** → ask for its local path.
  - **No** → ask the user to **create one** (a plain Git repo they will connect under Admin → Settings → Remote sync) and share its path. The skill does **not** create or connect the repo — the user owns that.
- Verify the path exists and is a Git working tree (it has a `.git`). This repo is the working directory for every step below.

## Step 2 — Name the app and create its directory

1. Settle on the app's **slug** before scaffolding — it's the directory name *and* the `/data-app/<slug>` URL. Lowercase letters, numbers, and single dashes (`[a-z0-9]+(?:-[a-z0-9]+)*`). If the purpose isn't clear yet, ask a one-line "what's this app for?" and propose a slug; confirm it.
2. Ensure `<repo>/data_apps/` exists; create it if missing.
3. Create `<repo>/data_apps/<slug>/`. **If it already exists**, treat it as an existing project (see below) — never overwrite without confirmation.

### Detecting an existing app

If `<repo>/data_apps/<slug>/` already holds a project, verify it matches the current `data-app-template`. Check **all** of:

1. `config/data-app-bundle.ts` externals include `"react"`, `"react/jsx-runtime"`,
   `"react/jsx-dev-runtime"`, `"@metabase/embedding-sdk-react"`,
   `"@metabase/embedding-sdk-react/data-app"` with corresponding globals (`React`,
   `__react_jsx_runtime__`, `__react_jsx_dev_runtime__`, `__metabase_sdk__`,
   `__metabase_data_app__`), and `vite.config.ts` reuses them.
2. `src/index.tsx`'s factory returns `{ component, theme }` (no args).
3. `src/dev.tsx` runs the built bundle through `createDataAppSandbox` (from
   `@metabase/embedding-sdk-react/data-app-dev`) and wraps the result in the
   SDK's `<MetabaseProvider authConfig={…}>`; `config/sandbox-dev-plugin.ts` is present.

**All checks pass** → template-shaped. Ask: "Extend this app, or scaffold a new one under a different slug?" If extend → skip the copy step, edit `src/`. If new → pick a different slug and restart at Step 2.

**Any check fails** → not template-shaped (older scaffold or drift). **Stop.** Tell the user the structure differs from the current template, extending it risks breaking the bundle contract, and ask whether to (1) migrate it, (2) scaffold fresh under a new slug and port the code over, or (3) proceed anyway at their risk. Wait for the answer.

Never overwrite existing files without explicit confirmation.

## Step 3 — Copy the template into the app directory

The template ships **inside this skill** at `./template/` (installed alongside the skill via `skills add metabase/metabase/skills#release-x.<major>.x`). Copy it into the app directory:

```bash
APP_DIR="<repo>/data_apps/<slug>"
# `<skill-dir>` = the directory this SKILL.md was loaded from
# (e.g. `.claude/skills/create-data-app`); the template is its `template/` subfolder.
cp -R "<skill-dir>/template/." "$APP_DIR/"
```

A data app is a *subdirectory* of the remote-sync repo, not its own repository — so this is a plain copy, never a nested `git clone` / `git init`. Everything below runs **inside `$APP_DIR`**.

## Step 4 — Customize

Once the template is in `<repo>/data_apps/<slug>/` (run everything below from that directory):

1. Edit `package.json` `name` to match the slug.
2. Pin `@metabase/embedding-sdk-react` to the published data-apps tag (the template ships with `*`):

   ```bash
   npm install @metabase/embedding-sdk-react@63-data-apps
   ```

   This resolves to the current internal-testing SDK build with the `@metabase/embedding-sdk-react/data-app` entrypoint and the `@metabase/embedding-sdk-react/data-app-dev` entrypoint the dev harness uses. Do not use `latest`, `63-stable`, or a generic `^0.63.x` range for data apps until the data-app SDK surface is promoted out of the internal tag.
3. **Ensure the repo-root `.gitignore` ignores `.env.local`** — do this *before* creating any credentials file so the secret can never be committed. Create the `.gitignore` if the repo doesn't have one, then add the entry if it's missing:

   ```bash
   ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
   if [ -z "$ROOT" ]; then
     echo "MISSING (run this from inside the connected git repo)"
   else
     GITIGNORE="$ROOT/.gitignore"
     # Create the repo-root .gitignore if absent, then ensure `.env.local` is
     # ignored so the credentials file (next step) can never be committed.
     [ -f "$GITIGNORE" ] || : > "$GITIGNORE"
     grep -qxF ".env.local" "$GITIGNORE" || echo ".env.local" >> "$GITIGNORE"
   fi
   ```
4. Set up the Metabase credentials at the **repository root** — `<repo>/.env.local` (usually two levels up from the app dir), **not** the app dir. One `.env.local` there serves every data app in the repo.

   Create it from the example if absent, then verify the two vars are set **without printing the file** (it may hold other secrets) — `source` it and echo only a pass/fail signal, never the values:

   ```bash
   # Resolve the repo root first; an unguarded $(git ...) would expand to
   # "/.env.local" outside a repo and touch a system-level file.
   ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
   if [ -z "$ROOT" ]; then
     echo "MISSING (run this from inside the connected git repo)"
   else
     ENV_FILE="$ROOT/.env.local"
     [ -f "$ENV_FILE" ] || cp .env.local.example "$ENV_FILE"
     # Source inside a subshell so the vars never leak into your environment.
     ( source "$ENV_FILE" 2>/dev/null
       [ -n "$DATA_APP_MB_URL" ] && [ "$DATA_APP_MB_URL" != "mb_replace_me" ] &&
       [ -n "$DATA_APP_MB_API_KEY" ] && [ "$DATA_APP_MB_API_KEY" != "mb_replace_me" ]
     ) && echo "creds present" || echo "MISSING"
   fi
   ```

   If it prints `MISSING`, **ask the user to fill `DATA_APP_MB_URL` (the running Metabase instance) and `DATA_APP_MB_API_KEY` (Admin → Authentication → API keys) in `<repo>/.env.local` themselves** — up front, before anything needs the key.

   > **Never ask the user to paste the API key into the chat, and never `cat` / `echo` / print `.env.local` or its variables.** It's git-ignored and may hold *other* secrets — the file's contents and the key must never enter the conversation or your context. Every command that needs the key `source`s the file (as above) so the shell uses the value directly; you only ever see the `creds present` / `MISSING` signal, never the secret itself. (`creds present` only means both vars are filled and not the default `mb_replace_me` placeholder — not that the URL or key are valid; a bad key surfaces later when a request fails.)
5. `npm install` (or whichever package manager the user prefers — the template ships with no lockfile, so `npm` / `yarn` / `pnpm` / `bun` all work; use the project's existing lockfile if one appears post-clone).
6. **Fix the app's `.gitignore` so the lockfile *and* the built bundle get committed.** Two things must end up tracked in the remote-sync repo:
   - **Lockfile** — strip the lockfile-ignoring block (the chunk between `# Lockfiles —` and `bun.lockb`, covering `package-lock.json` / `yarn.lock` / `pnpm-lock.yaml` / `bun.lock` / `bun.lockb`) so the project commits its lockfile for reproducible installs.
   - **The built bundle** — Metabase serves the file at the `path` declared in `data_app.yml` (the template builds to `dist/index.js`, the default `path`) straight from the committed Git tree, so **that file must be committed**. If the template's `.gitignore` ignores `dist/` (or wherever your build outputs), remove that line.
   **Verify with `git status`** — after `npm install` + a build, both the generated lockfile and the built bundle (the file `path` points at) must appear as untracked/committable files. If either doesn't, the relevant `.gitignore` line is still there; remove it and re-check. Do **not** skip this — agents have repeatedly shipped projects with no committed lockfile or an un-synced bundle.
7. `npm run dev` and confirm the preview at http://localhost:5174 renders the starter "Hello, data app" message.
8. If the preview hits CORS, add `http://localhost:5174` under Admin → Embedding → Embedded analytics SDK → CORS.
9. **Edit `data_app.yml`** (it ships with the template, in the app directory). This is the per-app config Metabase reads on sync — one file per app. Fill in its fields for this app:

   ```yaml
   name: Sales App        # display name shown in the admin UI
   slug: sales            # URL identity → /data-app/sales (match the directory name)
   path: ./dist/index.js  # bundle path, relative to this app's directory — leave as-is unless you change the build output
   # allowed_hosts:       # optional — external origins the app may fetch/XHR (see below)
   #   - https://api.example.com
   #   - https://*.internal.acme.com
   ```

   Commit it alongside the built bundle (the file `path` points at).

   **`allowed_hosts`** — only needed if the app calls an **external** API directly
   with `fetch`/`XHR`. The sandbox blocks all network egress by default; listing an
   origin here (exact or a `*.` subdomain wildcard) opens it in both `npm run dev`
   (dev-server CSP) and Metabase (iframe CSP + sandbox). Do **not** list the
   Metabase instance — Metabase data is read via the `useMetabaseQuery` data hooks
   and written via `useAction` (the SDK handles auth), never raw `fetch`. Leave
   `allowed_hosts` out entirely when the app only talks to Metabase.

## Step 5 — Verify the starter app

At this point the data app exists. Keep this workflow focused on creating the
project scaffold and proving the starter bundle works.

1. Run `npm run typecheck`.
2. Run `npm run build`.
3. Confirm `git status` shows the app source, lockfile, `data_app.yml`, and the
   built bundle (`dist/index.js` by default) as committable files.
4. If the user asked for a live preview, run `npm run dev` and confirm the
   starter "Hello, data app" screen renders through the sandbox preview.

Stop here if the user only asked to create, scaffold, or set up a data app.

If the next task is to build or iterate on the actual app UI — especially if it
mentions an existing data app, Metabase data, generated schema files, saved
questions, tables, metrics, actions, filters, semantic-layer entities, or data
hooks — treat it as a separate existing-data-app editing task. Use the agent's
normal skill-discovery flow from those terms. Do not expand this scaffold skill
with data-layer authoring rules.

**Do not modify `src/index.tsx`, `src/dev.tsx`, `vite.config.ts`, `config/data-app-bundle.ts`, `config/sandbox-dev-plugin.ts`, `tsconfig.json`, or `index.html` unless the change is genuinely required.** They encode the bundle contract with the host (factory shape, externals, document shell) and the dev sandbox harness. Tweaks here drift the dev preview from production — the iframe doesn't read your `index.html`, the host serves a byte-for-byte template — and silently break things like drill popups and routing.

**After every meaningful round of edits, run `npm run typecheck`.** It runs `tsc --noEmit` over `src/` and `vite.config.ts` — catches wrong prop shapes against the SDK types, broken refactors, missing imports, etc. The Vite dev server does NOT typecheck (it only transpiles), so errors that would fail a production CI run can sit invisibly in a passing `npm run dev` session. Run it before declaring a task complete.

**Before handoff, re-check package hygiene.** `@metabase/embedding-sdk-react` should use the expected data-app SDK source/tag for the target environment, and `@types/react-datepicker` should not be installed unless the chosen `react-datepicker` version actually needs it.

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

Default project layout once the starter app is extended:

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

### 3. Import SDK values from the correct SDK entrypoint

The build externalizes `@metabase/embedding-sdk-react` and `@metabase/embedding-sdk-react/data-app` to sandbox globals (`__metabase_sdk__` / `__metabase_data_app__`) in **both** production and `npm run dev` — in dev the sandbox harness endows them from the npm package, so the bundle runs identically in both. Just import from the entrypoints normally:

```tsx
// ✅ correct
import { StaticQuestion } from "@metabase/embedding-sdk-react";
import {
  DataAppRouter,
  DataAppLink,
  useMetabaseQuery,
} from "@metabase/embedding-sdk-react/data-app";

// ❌ wrong — no globalThis pattern; you'd be reading nothing
const { MetabaseProvider, StaticQuestion } = globalThis;
```

**Do NOT render `<MetabaseProvider>` in `App.tsx`.** The dev entry (`src/dev.tsx`) and the production host both wrap your tree in a provider that lives in their own realm — wrapping inside the bundle would route the SDK's `setState`-via-listener paths through the Near Membrane sandbox and silently break drill popups, plugin init, and similar.

### 4. Import `react` normally too

The build externalizes `react` (mapped to the `React` global), so a plain `import` resolves to React the same way in both modes — the production host and the dev sandbox both endow it as the `React` global:

```tsx
import { useState, useEffect, useMemo } from "react";
```

**No `import React from "react"` needed in TSX files** — the template uses the automatic JSX runtime (`jsx: "react-jsx"` in `tsconfig.json`, `react()` plugin default in `vite.config.ts`). The compiler injects the JSX-runtime imports it needs (`react/jsx-runtime` in production, `react/jsx-dev-runtime` in dev — both externalized and endowed by the sandbox). Just write JSX and named imports — that's it.

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
| `StaticQuestion` | Non-drillable question. Props include `questionId`, `card`, `withChartTypeSelector`, `height`, `width`. |
| `InteractiveQuestion` | Drillable question. Same props as StaticQuestion plus drill behaviors. Use `card={{ query }}` for ad hoc SDK-rendered questions. Add `visualization` when the request calls for a specific chart type, and add `visualizationSettings` only for explicit setting-level presentation changes; see the `metabase-data-app-semantic-layer` skill for the type guardrails. |
| `MetabaseCard` | Type-only import from `@metabase/embedding-sdk-react` for ad hoc SDK-rendered cards with `visualization` or `visualizationSettings`; the full contract lives in the `metabase-data-app-semantic-layer` skill. |
| `CreateQuestion`, `MetabotQuestion` | More question variants. |
| `StaticDashboard`, `InteractiveDashboard`, `EditableDashboard` | Dashboard variants. |
| `CreateDashboardModal` | Modal for new-dashboard flow. |
| `CollectionBrowser` | Collection picker. |
| `@metabase/embedding-sdk-react/data-app` exports | Data-app-only helpers for routing, schema-backed data reads, actions, clipboard, and sandbox-safe integration. Treat schema-backed queries, generated schema files, filters, metrics, actions, and other data-layer behavior as existing-data-app editing work; use skill discovery before authoring that code. |

### Blocked APIs

The Near Membrane sandbox throws at runtime on these globals. Use the endowed replacement instead:

| Blocked | Use instead |
|---|---|
| **Network** — `fetch`, `XMLHttpRequest`, `WebSocket` | Use the SDK/data-app APIs for Metabase reads and writes — never raw `fetch`. Raw `fetch`/`XHR` reach **only** the external origins listed in `data_app.yml`'s `allowed_hosts` (Step 4); everything else (including the Metabase origin) throws. `WebSocket` is always blocked. |
| **UI dialogs** — `alert`, `confirm`, `prompt` | Render a React modal in your own tree. |
| **Storage** — `localStorage`, `sessionStorage`, `indexedDB`, `document.cookie` | Treat the data app as stateless across reloads; persist via a Metabase action. |
| **Window / history navigation** — `window.open`, `history.pushState`, `history.replaceState` | `useDataAppLocation().navigate` for in-app; `<a target="_blank" rel="noopener">` for external. |
| **Clipboard** — `document.execCommand("copy")`, `navigator.clipboard` | `copy` (write-only): `import { copy } from "@metabase/embedding-sdk-react/data-app"`, then `await copy(text)` from a user event. There is **no** read/paste API — that would let a bundle exfiltrate whatever the user copied. |
| **Other `navigator.*` device APIs** — `geolocation`, etc. | Not available. |
| **Global `document`/`window` listeners** for typing/clipboard events — `keydown`, `keyup`, `keypress`, `beforeinput`, `input`, `paste`, `copy`, `cut`, `before*paste/copy/cut`, `compositionstart/update/end`, `storage` | Attach the listener to your own element, or use the React handler (`onKeyDown`, `onPaste`, …) on the specific input/container. The same listener on a script-owned element still works. |

**Rule of thumb:** if you're about to touch `window.X`, `document.X`, `navigator.X`, `history.X`, or any storage global, stop and pick the endowed replacement above. The endowed surface (React + SDK components + data hooks + `useAction` + DataAppRouter + `copy`) covers every routine need; anything outside it is intentionally unreachable.

### When to use SDK charts vs `useMetabaseQuery`

This is a per-rendering decision, not a project-wide one:

- **`useMetabaseQueryObject` + `StaticQuestion` / `InteractiveQuestion`** — default for ordinary dashboard charts: bar, line, area, row, pie, scalar/smartscalar, gauge, progress, pivot, map, sortable table, and other displays Metabase already renders well. Build the semantic query from generated schema objects, then pass it to the SDK component with the `query` prop, for example `<StaticQuestion query={trendQuery} ... />`.
- **`useMetabaseQuery`** — use when React genuinely needs row values: extracting KPI numbers, powering custom controls, composing bespoke summary cards, combining multiple queries into one UI element, or rendering a visualization Metabase cannot express.

Generated dashboards should prefer SDK-rendered charts. Do not rebuild normal bar/line/table charts in React just to match app chrome. If you choose `useMetabaseQuery`, keep the row handling typed.

**Always render a spinner (or skeleton) while `isLoading` is `true`** — never an empty slot or stale value, which causes layout shift when the data arrives. Same rule for lifted / derived queries (pass `isLoading` down) and for `useAction`'s `isExecuting` (spinner in the button + `disabled={isExecuting}`).

**Call each schema entry at most once per render tree.** Multiple `useMetabaseQuery` calls on the same `questionId` (or same `tableId` + identical filters/measures/breakouts) mount independent subscriptions, fire duplicate queries, and let consumers disagree mid-load. Lift the call to the highest component that needs the data; pass `data` / `isLoading` / `error` down as props. Different ids — or the same id with different filters / breakouts — are different data sources; call them separately.

(For the hook contract itself — generics, table-vs-metric variants, segments / measures / breakouts, debugging — see the `metabase-data-app-semantic-layer` skill.)

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

## Sync to Metabase

Data apps are delivered by Git, not uploaded — you commit the app directory and Metabase pulls it on its next remote-sync import.

1. `npm run build` → produces the bundle at your `data_app.yml` `path` (the template builds to `dist/index.js`).
2. From the **repo root**, commit the app directory — its `data_app.yml`, the built bundle (the file `path` points at), the source, and the lockfile — and **push**:
   ```bash
   git add data_apps/<slug>
   git commit -m "Add <slug> data app"
   git push
   ```
3. The app appears in Metabase on the next remote-sync import — a manual **Pull changes** (Admin → Data apps / Remote sync), the auto-import poll, or a restart — reachable at `/data-app/<slug>`.

**To update:** commit a new build and pull again. **To remove:** delete `data_apps/<slug>/`, commit, and pull — Metabase prunes apps whose directory is gone from the repo.

## Common pitfalls

| Symptom | Fix |
|---|---|
| "Failed to fetch the user, the session might be invalid." | Bad API key or CORS — check `( ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"; [ -n "$ROOT" ] && source "$ROOT/.env.local" 2>/dev/null; [ -n "$DATA_APP_MB_URL" ] && [ "$DATA_APP_MB_URL" != "mb_replace_me" ] && [ -n "$DATA_APP_MB_API_KEY" ] && [ "$DATA_APP_MB_API_KEY" != "mb_replace_me" ] && curl -H "x-api-key: $DATA_APP_MB_API_KEY" "$DATA_APP_MB_URL/api/user/current" || echo "set real DATA_APP_MB_URL / DATA_APP_MB_API_KEY in the repo-root .env.local" )` (uses the repo-root `.env.local`), add `http://localhost:5174` to SDK CORS origins. |
| Invisible chart labels. | Set `text-primary` in the theme (see *Theme rules*). |
| Chart overflows its container. | Pass `height` / `width` to the SDK component (see *SDK component sizing*). |
| "Invalid hook call" at runtime. | `react` not externalized — the template ships with this configured; check you didn't edit `vite.config.ts`. |
| Bundle is multi-MB. | One of `react`, `@metabase/embedding-sdk-react`, or `@metabase/embedding-sdk-react/data-app` was removed from `vite.config.ts`'s `external` — restore from the template. |
| `dist/index.js` doesn't assign to `__dataAppFactory__`. | `lib.name: "__dataAppFactory__"` got removed from `vite.config.ts` — restore from the template. |
| Dev preview blank, console says `MetabaseProvider is undefined`. | `src/dev.tsx` got edited and lost the `<MetabaseProvider authConfig={…}>` wrap. |
| `Cannot find module '@metabase/embedding-sdk-react'`. | Run `npm install` (or the equivalent for your package manager). Types come from the package directly. |
| Drill popups don't open / SDK components show empty / "MetabaseProvider not found" at runtime in dev. | `src/dev.tsx` is missing the `<MetabaseProvider authConfig={…}>` wrap. The bundle's `App.tsx` does NOT include `MetabaseProvider` — `dev.tsx` provides it. |
| Dev preview blank / `Bundle did not assign a function to __dataAppFactory__` / sandbox errors in dev. | `config/sandbox-dev-plugin.ts` or `config/data-app-bundle.ts` was edited and the dev sandbox bundle no longer builds correctly (externals/globals drift, or the factory global changed). Restore from the template. |
| Component state resets on every edit. | Expected: dev rebuilds the bundle and does a *soft reload* — re-evaluates it in the sandbox and remounts the app (auth/SDK stay loaded, no browser refresh). There's no module-level HMR / Fast Refresh because the app is an evaluated bundle in an isolated realm, so local component state resets. |
| URL changes but UI doesn't update in production (works in dev). | `vite.config.ts` is missing `@metabase/embedding-sdk-react/data-app` in `external` / `output.globals`. Without it, the data-app routing primitives get inlined into the bundle and the React-state-batching-through-Near-Membrane bug breaks navigation re-renders. Restore from the template. |
