---
name: add-data-app-routing
description: Add client-side routing (multiple pages) to an existing Metabase data-app project using the host-provided `DataAppRouter`, `DataAppLink`, and `useDataAppLocation` primitives. Use when the user has an existing data-app project and wants more than one page.
---

# Add routing to a data-app

A Metabase data-app bundle doesn't bundle a router library — it imports three small primitives from `@metabase/embedding-sdk-react/data-app`:

| API | Purpose |
|---|---|
| `<DataAppRouter>` | Wrap the app once. Tracks the current sub-path. Auto-detects the iframe's URL prefix; bundle author writes no basename. |
| `<DataAppLink to="/customers/42">` | Internal navigation link. Renders a real `<a href>` so middle-click / cmd-click open in a new tab. |
| `useDataAppLocation()` | Returns `{ pathname, navigate }`. Use `pathname` for match-by-equality / `startsWith` rendering; use `navigate(to)` for programmatic nav. |

That's the entire surface. **No `react-router` of any version, no `<BrowserRouter>`, no `<HashRouter>`.** The API is deliberately decoupled from any router library so a future Metabase version can swap the underlying implementation without touching bundle code.

## When to use this skill

- The user has a working data-app project — `vite.config.ts` with `name: "__dataAppFactory__"`, an `src/index.tsx` that exports a factory, and an `src/dev.tsx` for the dev preview.
- The user wants the bundle to render different content at different URLs (`/overview`, `/customers/:id`).
- **Do not use this skill** to scaffold a project from scratch — it only patches an existing data-app project. If there is no project yet, stop and tell the user a project needs to exist first.

## Prerequisite — `data-app` subpath externalized in `vite.config.ts`

Before continuing, confirm `vite.config.ts` has both `react` *and* `@metabase/embedding-sdk-react/data-app` in `rollupOptions.external` and a corresponding entry in `output.globals` (mapping to `__metabase_data_app__`). A correctly scaffolded data-app project ships with this already.

If it's missing, the routing primitives below will work in dev preview and silently break in the production iframe: the bundler inlines the subpath's implementations into `dist/index.js`, those run inside the Near Membrane sandbox, and React's state batching swallows the navigation `setState`. URL changes, UI doesn't.

If you see that symptom after following the steps below, missing externals is the cause.

## Step 1 — Wrap `App.tsx` with `<DataAppRouter>`

Import the routing primitives normally. `<DataAppRouter>` does NOT take a `basename` prop — it auto-detects the iframe's URL prefix (`/embed/data-app/<name>`) in production and resolves to no prefix in the Vite dev preview.

`App.tsx` is pure content — no `<MetabaseProvider>` here. The dev entry (`src/dev.tsx`) and the production host both wrap the tree.

```tsx
import { StaticQuestion } from "@metabase/embedding-sdk-react";
import {
  DataAppRouter,
  DataAppLink,
  useDataAppLocation,
} from "@metabase/embedding-sdk-react/data-app";

function Nav() {
  return (
    <nav style={{ padding: 16, borderBottom: "1px solid #e5e7eb" }}>
      <DataAppLink to="/" style={{ marginRight: 16 }}>Overview</DataAppLink>
      <DataAppLink to="/customers/42">Customer 42</DataAppLink>
    </nav>
  );
}

function Page() {
  const { pathname } = useDataAppLocation();

  if (pathname === "/") {
    return (
      <div style={{ padding: 24 }}>
        <h1>Overview</h1>
        <StaticQuestion questionId={1} height={360} />
      </div>
    );
  }

  const customerMatch = pathname.match(/^\/customers\/(\d+)$/);
  if (customerMatch) {
    const id = Number(customerMatch[1]);
    return (
      <div style={{ padding: 24 }}>
        <h1>Customer #{id}</h1>
        <StaticQuestion questionId={id} height={360} />
      </div>
    );
  }

  return <div style={{ padding: 24 }}>Not found: {pathname}</div>;
}

export default function App() {
  return (
    <DataAppRouter>
      <Nav />
      <Page />
    </DataAppRouter>
  );
}
```

Run `yarn dev`, click the links, watch the URL bar change. Reload at `http://localhost:5174/customers/42` and the dev preview lands on the customer route directly.

## How navigation translates to the parent URL

You don't need to do anything for this. For context:

- Bundle calls `<DataAppLink to="/customers/42">` → host's `navigate` runs `pushState` with `/embed/data-app/<name>/customers/42`.
- The parent's `AppView` observes the iframe URL change and mirrors it to the parent's URL bar as `/data-app/<name>/customers/42` — the `/embed` prefix is stripped because the parent's React Router route is `/data-app/:name/*`, not `/embed/...`.
- Reload works because the BE serves the same `data-app.html` for every `/embed/data-app/:name/*` sub-path; the iframe boots, `<DataAppRouter>` reads `window.location.pathname`, auto-detects the prefix, and starts at the right sub-path.

## What NOT to do

- **Don't add `react-router-dom`** (or any router library) to the project. The bundle doesn't need it.
- **Don't use `<BrowserRouter>` or `<HashRouter>`** inside the bundle. They run their own `setState` flow that hits the Near Membrane batching bug.
- **Don't call `window.history.pushState` directly** from inside the bundle. Use `<DataAppLink>` or `navigate` from `useDataAppLocation`.
- **Don't try to read or write the parent's URL.** The iframe's sandbox attribute blocks it by design.

## Common patterns

### Conditional render based on path

```tsx
const { pathname } = useDataAppLocation();
if (pathname === "/") return <Home />;
if (pathname.startsWith("/customers/")) return <Customer />;
return <NotFound />;
```

### Programmatic navigation (e.g. from a `<button>`)

```tsx
function OpenCustomerButton({ id }: { id: number }) {
  const { navigate } = useDataAppLocation();
  return <button onClick={() => navigate(`/customers/${id}`)}>Open #{id}</button>;
}
```

### Parsing path params manually

There's no built-in `useParams`. Match yourself:

```tsx
const { pathname } = useDataAppLocation();
const match = pathname.match(/^\/customers\/(\d+)$/);
if (match) {
  const id = Number(match[1]);
  // ...
}
```

If you find yourself doing this often, factor it into your own helper inside the bundle:

```tsx
function useCustomerIdFromPath(): number | null {
  const { pathname } = useDataAppLocation();
  const m = pathname.match(/^\/customers\/(\d+)$/);
  return m ? Number(m[1]) : null;
}
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `DataAppLink must be rendered inside a <DataAppRouter>` thrown at runtime. | Wrap the tree with `<DataAppRouter>`. |
| URL changes in dev preview but the production iframe shows the bundle re-render itself on every navigation (or routes don't work in prod at all). | `vite.config.ts` is missing `@metabase/embedding-sdk-react/data-app` in `external` / `output.globals` — see Step 1. Without it Vite inlines the package's implementation into `dist/index.js`, which runs inside the Near Membrane sandbox and breaks React's state batching. |
| URL changes but UI doesn't. | A `<BrowserRouter>`/`<HashRouter>` is still in the tree. Strip the router library out and use `<DataAppRouter>` / `<DataAppLink>` instead — the Near Membrane interaction with React-18 batching breaks every router that runs its own `setState` inside the bundle. |
| Reload at a deep URL in dev (`localhost:5174/customers/42`) shows a blank page. | Vite's dev server is serving the route as a 404 instead of falling back to `index.html`. Set `appType: "spa"` in `vite.config.ts` (it's the default — only an issue if someone overrode it). |
| Middle-click on a `<DataAppLink>` does nothing. | The link uses `event.button !== 0` to skip non-left clicks; check you haven't wrapped it in another component that swallows the event. |
