import { type ReactNode, createContext, useContext } from "react";
import { Router, browserHistory } from "react-router";

import { DATA_APP_EMBED_PREFIX } from "metabase/data_apps/constants";

/**
 * Data-app routing primitives.
 *
 * Implementation uses Metabase's bundled `react-router@3` — same library
 * MB uses everywhere else. The bundle never sees the router library: it
 * only depends on the `{ pathname, navigate }` shape exposed by
 * `useDataAppLocation` and on the `<DataAppLink>` component. When MB
 * jumps v3 → v6/v7, this file's internals change; bundles stay untouched.
 *
 * Lives in host code, endowed to the bundle via
 * `@metabase/embedding-sdk-react/data-app`. All routing state lives on
 * `browserHistory` (a `react-router` singleton) — no custom React Context
 * is needed across the public API.
 */

/**
 * Escape a string for safe use as a literal inside a `RegExp`. The
 * embed-prefix constant doesn't currently contain regex metacharacters,
 * but escaping makes the regex robust against future changes to the
 * constant.
 */
const escapeRegExp = (str: string): string =>
  str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
 * subpath install root — so consumers can strip it before exposing the
 * sub-path to the bundle. Returns `""` for non-iframe contexts (the dev
 * preview).
 *
 * Examples:
 *   `/embed/data-app/sales/customers/42`       → `/embed/data-app/sales`
 *   `/mb/embed/data-app/sales/customers/42`    → `/mb/embed/data-app/sales`
 *   `/customers/42`                            → `""`
 */
export const getBasename = (): string =>
  window.location.pathname.match(DATA_APP_BASENAME_RE)?.[1] ?? "";

const RouteContentBridge = createContext<ReactNode>(null);

const RouteContent = () => useContext(RouteContentBridge);

const STABLE_ROUTES = { path: "*", component: RouteContent };

interface DataAppRouterProps {
  children?: ReactNode;
}

/**
 * Wrap your data-app tree once. Inside, use `<DataAppLink to="…">` for
 * navigation and `useDataAppLocation()` to read the current path.
 *
 * No `basename` prop: the basename is auto-detected from the iframe URL
 * (`/embed/data-app/<name>`). In the dev preview where there's no prefix,
 * the same code works — `basename` resolves to `""` and the sub-path is
 * just the raw pathname.
 */
export const DataAppRouter = ({ children }: DataAppRouterProps) => (
  <RouteContentBridge.Provider value={children}>
    <Router history={browserHistory} routes={STABLE_ROUTES} />
  </RouteContentBridge.Provider>
);
