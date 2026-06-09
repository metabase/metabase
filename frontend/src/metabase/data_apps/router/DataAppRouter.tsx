import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Route, Router, browserHistory } from "react-router";

/**
 * Data-app routing primitives.
 *
 * Implementation uses Metabase's bundled `react-router@3` — same library
 * MB uses everywhere else. The bundle never sees the router library: it
 * only depends on the `{ pathname, navigate }` context shape we expose
 * and on the `<DataAppLink>` component. When MB jumps v3 → v6/v7, this
 * file's internals change; bundles stay untouched.
 *
 * Lives in host code, endowed to the bundle via
 * `@metabase/embedding-sdk-react/data-app`. Every `setState` here runs in
 * host realm; no Near Membrane crossing.
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

export function getBasename(): string {
  return detectBasename();
}

function computeSubPath(basename: string): string {
  const full = window.location.pathname;
  const sub =
    basename && full.startsWith(basename) ? full.slice(basename.length) : full;
  return sub || "/";
}

/**
 * Internal: react-router 3 expects `<Route>` children inside `<Router>`,
 * and `<Route>`'s `component` prop must be a stable reference (otherwise
 * v3 remounts on every render and the child tree loses state). We pass
 * the user's content through React Context so the Route's component can
 * stay a stable function reference while still rendering whatever the
 * `<DataAppRouter>` is currently wrapping.
 */
const RouteContentBridge = createContext<ReactNode>(null);

function RouteContent() {
  return useContext(RouteContentBridge);
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
    // `browserHistory.listen` fires for every navigation — `Link` clicks,
    // imperative `push` calls, and browser back/forward. One subscription
    // covers all of them.
    const unsubscribe = browserHistory.listen(() => {
      setPathname(computeSubPath(basename));
    });

    return unsubscribe;
  }, [basename]);

  const navigate = useCallback(
    (to: string) => {
      // `to` is bundle-relative (e.g. "/customers/42"). The real URL is
      // `basename + to`.
      browserHistory.push(basename + to);
    },
    [basename],
  );

  const value = useMemo<DataAppRouterContextValue>(
    () => ({ pathname, navigate }),
    [pathname, navigate],
  );

  const bridgeValue = useMemo(
    () => (
      <DataAppRouterContext.Provider value={value}>
        {children}
      </DataAppRouterContext.Provider>
    ),
    [value, children],
  );

  return (
    <RouteContentBridge.Provider value={bridgeValue}>
      <Router history={browserHistory}>
        <Route path="*" component={RouteContent} />
      </Router>
    </RouteContentBridge.Provider>
  );
}
