# data-app-template

Starter template for building Metabase **data-apps** — single-bundle
React apps that admins upload and embed inside Metabase via an isolated
iframe.

## Quick start

```bash
gh repo create my-data-app --template metabase/data-app-template --private --clone
cd my-data-app
npm install                           # or yarn / pnpm / bun — no lockfile shipped
cp .env.local.example .env.local      # set VITE_MB_URL + VITE_MB_API_KEY
npm run dev                           # preview at http://localhost:5174
npm run build                         # produces dist/index.js for upload
```

To upload: Metabase → Admin → Data apps → **Add**, pick a short `name`
(it appears in the `/data-app/<name>` URL), upload `dist/index.js`.

If the dev preview hits CORS, add `http://localhost:5174` under
Admin → Embedding → Embedded analytics SDK → CORS.

## What's in the box

```
.
├── package.json            ← @metabase/embedding-sdk-react + react/react-dom
├── vite.config.ts          ← lib mode → IIFE; externalizes SDK + react
├── tsconfig.json
├── index.html              ← dev preview shell (do not edit — see note)
├── src/
│   ├── index.tsx           ← PRODUCTION entry — factory returns { component, theme }
│   ├── dev.tsx             ← DEV entry — wraps App with MetabaseProvider + authConfig
│   ├── theme.ts            ← MetabaseTheme, shared by dev + prod entries
│   ├── App.tsx             ← edit this; pure content, no MetabaseProvider wrap
│   └── vite-env.d.ts       ← Vite env-var types
├── .env.local.example
└── .gitignore
```

`src/App.tsx` and anything you add under `src/` is shared between dev
and prod. The two modes only diverge at the entry layer.

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
