import {
  type ReactNode,
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * Data-app routing primitives.
 *
 * Why custom — and not `react-router-dom` in the bundle:
 *
 * The bundle runs inside a Near Membrane sandbox. When `react-router-dom`'s
 * `setState` (inside `BrowserRouter`'s `history.listen` handler) crosses
 * from the bundle realm into host React, React 18's automatic batching
 * silently drops the update — same structural bug class as
 * https://github.com/facebook/react/issues/24458, but triggered by Near
 * Membrane's detached-iframe realm rather than the Safari microtask quirk.
 * Result: URL changes, UI doesn't.
 *
 * The fix is to keep every `setState` on the host side of the membrane.
 * This provider lives in host code; the bundle just renders
 * `<DataAppRouter>`, `<DataAppLink>`, `useDataAppLocation()` and never
 * touches `window.history` or React state related to routing itself.
 */
interface DataAppRouterContextValue {
  pathname: string;
  navigate: (to: string) => void;
}

export const DataAppRouterContext =
  createContext<DataAppRouterContextValue | null>(null);

const DATA_APP_BASENAME_RE = /^\/embed\/data-app\/[^/]+/;

/**
 * Returns the iframe URL's data-app prefix (e.g. `/embed/data-app/sales`)
 * so the provider can strip it before exposing the sub-path to the bundle.
 * Returns `""` for non-iframe contexts (the dev preview).
 */
function detectBasename(): string {
  return window.location.pathname.match(DATA_APP_BASENAME_RE)?.[0] ?? "";
}

function computeSubPath(basename: string): string {
  const full = window.location.pathname;
  const sub = basename && full.startsWith(basename) ? full.slice(basename.length) : full;
  return sub || "/";
}

interface DataAppRouterProps {
  children?: ReactNode;
}

/**
 * Wrap your data-app tree once. Inside, use `<DataAppLink to="…">` for
 * navigation and `useDataAppLocation()` to read the current path.
 *
 * No `basename` prop: the provider auto-detects the iframe's URL prefix
 * (`/embed/data-app/<name>`). In the dev preview where there's no prefix,
 * the same code works — `basename` resolves to `""` and the sub-path is
 * just the raw pathname.
 */
export function DataAppRouter({ children }: DataAppRouterProps) {
  // Basename never changes after mount — the iframe doesn't navigate to a
  // different `<name>`; that'd be a parent-level route change which
  // re-mounts the iframe entirely.
  const basename = useMemo(() => detectBasename(), []);
  const [pathname, setPathname] = useState(() => computeSubPath(basename));

  useEffect(() => {
    // Browser back/forward and our own `pushState`-driven updates: both
    // observed by re-reading `window.location.pathname`.
    const sync = () => setPathname(computeSubPath(basename));
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [basename]);

  const navigate = useCallback(
    (to: string) => {
      // `to` is bundle-relative (e.g. "/customers/42"). The real URL is
      // `basename + to`.
      const target = basename + to;
      if (window.location.pathname !== target) {
        window.history.pushState(null, "", target);
      }
      setPathname(to || "/");
    },
    [basename],
  );

  const value = useMemo<DataAppRouterContextValue>(
    () => ({ pathname, navigate }),
    [pathname, navigate],
  );

  return (
    <DataAppRouterContext.Provider value={value}>
      {children}
    </DataAppRouterContext.Provider>
  );
}
