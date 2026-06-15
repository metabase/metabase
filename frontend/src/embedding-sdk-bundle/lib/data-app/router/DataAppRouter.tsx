import type { ReactNode } from "react";

/**
 * URL prefix the BE uses to serve the data-app iframe. Kept as a single
 * constant so the regex below, the `src` builder in the host `AppView`, and
 * the URL-mirror logic don't drift apart.
 *
 * Must match the route definitions in `src/metabase/server/routes.clj`:
 *   `(GET ["/data-app/:name" …] [] index/data-app)`
 *   `(GET ["/data-app/:name/*" …] [] index/data-app)`
 * under the `/embed` context.
 */
export const DATA_APP_EMBED_PREFIX = "/embed/data-app";

/**
 * Data-app routing primitives.
 *
 * The bundle never sees a router library directly — it only depends on
 * the `{ pathname, navigate }` shape exposed by `useDataAppLocation` and
 * on the `<DataAppLink>` component. All routing state lives on the
 * `browserHistory` singleton (from `react-router`, but used only for its
 * function-based `push` / `listen` API — no React components, no legacy
 * context).
 *
 * `<DataAppRouter>` itself is a pass-through today. It stays as a
 * dedicated component so future additions (error boundaries, suspense,
 * routing-scoped providers) can land here without a breaking change to
 * the bundle's `<DataAppRouter>` usage.
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
  <>{children}</>
);
