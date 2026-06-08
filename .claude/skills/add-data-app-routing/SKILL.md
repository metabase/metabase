---
name: add-data-app-routing
description: Add client-side routing (multiple pages) to an existing Metabase data-app project using the host-provided `DataAppRouter`, `DataAppLink`, and `useDataAppLocation` primitives. Use when the user has an existing data-app project and wants more than one page.
---

# Add routing to a data-app

A Metabase data-app bundle doesn't bundle a router library — it uses three small primitives the host endows on `globalThis`:

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

## Step 1 — Add the endowment types to `src/globals.d.ts`

Extend `globalThis` so TypeScript knows the routing primitives. The types use only plain React DOM types — no `react-router` types leak in.

```ts
declare global {
  // ... existing MetabaseProvider / StaticQuestion / etc. types

  var DataAppRouter: (props: { children?: React.ReactNode }) => JSX.Element;

  var DataAppLink: (
    props: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
      to: string;
      children?: React.ReactNode;
    },
  ) => JSX.Element;

  var useDataAppLocation: () => {
    pathname: string;
    navigate: (to: string) => void;
  };
}

export {};
```

## Step 2 — Wrap `App.tsx` with `<DataAppRouter>`

Read the destructured globals at module load like the other endowments. The router does NOT take a `basename` prop — it auto-detects the iframe's URL prefix (`/embed/data-app/<name>`) in production and resolves to no prefix in the Vite dev preview.

```tsx
import type { MetabaseTheme } from "@metabase/embedding-sdk-react";

const {
  MetabaseProvider,
  StaticQuestion,
  DataAppRouter,
  DataAppLink,
  useDataAppLocation,
} = globalThis;

const sdkTheme: MetabaseTheme = {
  // (your existing theme)
};

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
    <MetabaseProvider theme={sdkTheme}>
      <DataAppRouter>
        <Nav />
        <Page />
      </DataAppRouter>
    </MetabaseProvider>
  );
}
```

Run `yarn dev`, click the links, watch the URL bar change. Reload at `http://localhost:5174/customers/42` and the dev preview lands on the customer route directly.

## Step 3 — Mirror the endowments in `src/dev-globals.tsx`

In production the host endows these on `globalThis`. In dev mode you have to mirror that yourself with a tiny local implementation. Add to `src/dev-globals.tsx` (alongside the existing `MetabaseProvider` shim):

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";

const RouterContext = createContext<{
  pathname: string;
  navigate: (to: string) => void;
} | null>(null);

function DataAppRouterDev({ children }: { children?: ReactNode }) {
  const [pathname, setPathname] = useState(
    () => window.location.pathname || "/",
  );

  useEffect(() => {
    const sync = () => setPathname(window.location.pathname || "/");
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const navigate = useCallback((to: string) => {
    if (window.location.pathname !== to) {
      window.history.pushState(null, "", to);
    }
    setPathname(to || "/");
  }, []);

  const value = useMemo(() => ({ pathname, navigate }), [pathname, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

function DataAppLinkDev({
  to,
  children,
  onClick,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  to: string;
  children?: ReactNode;
}) {
  const ctx = useContext(RouterContext);
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    )
      return;
    e.preventDefault();
    ctx?.navigate(to);
  };
  return <a {...rest} href={to} onClick={handleClick}>{children}</a>;
}

function useDataAppLocationDev() {
  const ctx = useContext(RouterContext);
  if (!ctx) {
    throw new Error("useDataAppLocation must be inside <DataAppRouter>");
  }
  return ctx;
}

globalThis.DataAppRouter = DataAppRouterDev;
globalThis.DataAppLink = DataAppLinkDev;
globalThis.useDataAppLocation = useDataAppLocationDev;
```

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
| `DataAppLink must be rendered inside a <DataAppRouter>` thrown at runtime. | Wrap the tree with `<DataAppRouter>`. If you're in the dev preview and the error persists, `dev-globals.tsx` is missing the dev mirror — check Step 3. |
| URL changes but UI doesn't. | A `<BrowserRouter>`/`<HashRouter>` is still in the tree. Strip the router library out and use `<DataAppRouter>` / `<DataAppLink>` instead — the Near Membrane interaction with React-18 batching breaks every router that runs its own `setState` inside the bundle. |
| Reload at a deep URL in dev (`localhost:5174/customers/42`) shows a blank page. | Vite's dev server is serving the route as a 404 instead of falling back to `index.html`. Set `appType: "spa"` in `vite.config.ts` (it's the default — only an issue if someone overrode it). |
| Middle-click on a `<DataAppLink>` does nothing. | The link uses `event.button !== 0` to skip non-left clicks; check you haven't wrapped it in another component that swallows the event. |
