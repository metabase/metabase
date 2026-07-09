# data-app-template

A Metabase **data app** — a single-bundle React app (built with the Embedding
SDK) that Metabase renders inside an isolated, sandboxed iframe at
`/apps/<slug>`.

Data apps are delivered through **Git, not uploaded**: this directory lives at
`data_apps/<slug>/` inside a repository connected to Metabase via remote sync.
You commit the built bundle (`dist/index.js`), and on the next remote-sync
import Metabase materializes the app and serves it. There is no upload step.

## Develop

```bash
npm install                           # or yarn / pnpm / bun — no lockfile shipped
cp .env.local.example .env.local      # set DATA_APP_MB_URL + DATA_APP_MB_API_KEY
npm run dev                           # preview at http://localhost:5174
```

`npm run dev` previews the app against a real Metabase **through the same
Near-Membrane sandbox + CSP rules production uses**, so dev behaves like prod.
Edit anything under `src/` — the preview soft-reloads.

If the dev preview hits CORS, add `http://localhost:5174` under
Admin → Embedding → Embedded analytics SDK → CORS.

## Ship

```bash
npm run build                         # produces a single dist/index.js
```

Commit `dist/index.js` (the `path` declared in `data_app.yaml`) along with your
source. The app appears at `/apps/<slug>` after Metabase's next remote-sync
import (manual "Pull changes", auto-import, or startup).

## What's in the box

```
.
├── data_app.yaml           ← manifest: name, slug, bundle path, allowed_hosts
├── package.json            ← @metabase/embedding-sdk-react + react/react-dom + Vite toolchain
├── vite.config.ts          ← one-liner: `export default dataAppConfig()`
├── tsconfig.json
├── src/
│   ├── index.tsx           ← entry — default-exports a factory returning { component, providerProps }
│   ├── App.tsx             ← edit this; pure content, no <MetabaseProvider> wrap
│   └── theme.ts            ← the SDK theme, passed via providerProps
├── .env.local.example
└── .gitignore
```

The build, dev server, Near-Membrane sandbox, and bundle contract all live in
the SDK behind `dataAppConfig()` — there's no `index.html` or separate dev entry
to edit. Keep `<MetabaseProvider>` out of `App.tsx`: the production host and the
dev preview each provide it in their own realm.

The build output is a single self-contained `dist/index.js` — CSS and assets are
inlined, and React + the SDK are externalized to the host's instances, so the
bundle stays small.

## Calling external APIs (`allowed_hosts`)

A data app runs sandboxed: by default it **can't** `fetch`/XHR anything. To let
it reach an external API, list the origins in `data_app.yaml` under
`allowed_hosts` (supports a `*.` subdomain wildcard):

```yaml
allowed_hosts:
  - https://api.example.com
  - https://*.internal.acme.com
```

The same allowlist is enforced in both places: `npm run dev` applies it via the
dev server's CSP, and Metabase applies it via the iframe CSP + the membrane
sandbox. The Metabase instance itself is reached through the SDK (not listed
here). A call to any other host fails in dev exactly as it will in production.

### Forms and embeds

`allowed_hosts` also governs native `<form action="…">` submissions and
`<iframe src="…">` / navigations, not just `fetch`.

Prefer a **client-side** form — `<form onSubmit={(e) => { e.preventDefault(); … }}>`
that writes via the SDK (`useAction`) or `fetch` — over a native
`<form action="…">`. A native submit **navigates the sandboxed iframe away** from
your app.

If you do use `<form action="https://…">` (or embed/navigate to a host via an
`<iframe>`), the target host must be in `allowed_hosts`, or the browser blocks it
(`form-action` for submits, `frame-src` for embeds). Note a host you embed or
navigate to must also **allow being framed** (`X-Frame-Options` /
`frame-ancestors`) — many public sites (e.g. `example.com`) don't, so they can't
be shown in-frame regardless of `allowed_hosts`.
