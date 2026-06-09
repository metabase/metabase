import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Router, browserHistory } from "react-router";

import { DATA_APP_EMBED_PREFIX } from "metabase/data_apps/constants";

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

/**
 * Escape a string for safe use as a literal inside a `RegExp`. The
 * embed-prefix constant doesn't currently contain regex metacharacters,
 * but escaping makes the regex robust against future changes to the
 * constant.
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Captures everything from the start of `pathname` up to and including the
// data-app `:name` segment. Tolerates a Metabase subpath install
// (`/mb/embed/data-app/sales/…`) by allowing arbitrary characters before
// the `DATA_APP_EMBED_PREFIX` literal. In root installs (no subpath) the
// pre-segment is empty and the match becomes `${DATA_APP_EMBED_PREFIX}/<name>`.
const DATA_APP_BASENAME_RE = new RegExp(
  `^(.*?${escapeRegExp(DATA_APP_EMBED_PREFIX)}/[^/]+)`,
);

/**
 * Returns the iframe URL's data-app prefix — including any Metabase
 * subpath install root — so the provider can strip it before exposing
 * the sub-path to the bundle. Returns `""` for non-iframe contexts (the
 * dev preview).
 *
 * Examples:
 *   `/embed/data-app/sales/customers/42`       → `/embed/data-app/sales`
 *   `/mb/embed/data-app/sales/customers/42`    → `/mb/embed/data-app/sales`
 *   `/customers/42`                            → `""`
 */
function detectBasename(): string {
  return window.location.pathname.match(DATA_APP_BASENAME_RE)?.[1] ?? "";
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

// react-router 3 ignores route changes after the first mount and warns
// "You cannot change <Router routes>; it will be ignored" if you re-pass
// JSX children each render. Hoist the route definition to a single
// module-level reference so the `routes` prop is identity-stable across
// every `<DataAppRouter>` re-render.
const STABLE_ROUTES = { path: "*", component: RouteContent };

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
      <Router history={browserHistory} routes={STABLE_ROUTES} />
    </RouteContentBridge.Provider>
  );
}
