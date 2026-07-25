import type { ReactNode } from "react";

import { getRawBrowserHistory } from "metabase/router";
import { DATA_APP_EMBED_PREFIX } from "metabase/urls/data-apps";

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
// (`/mb/embed/apps/sales/…`) by allowing arbitrary characters before
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
 *   `/embed/apps/sales/customers/42`       → `/embed/apps/sales`
 *   `/mb/embed/apps/sales/customers/42`    → `/mb/embed/apps/sales`
 *   `/customers/42`                            → `""`
 */
export const getBasename = (): string =>
  window.location.pathname.match(DATA_APP_BASENAME_RE)?.[1] ?? "";

// The v7 browser history the data app drives its URL with accepts only ONE
// active listener (it throws on a second). But more than one data-app subscriber
// can be live at once — the dev preview's `MetabaseProvider` renders the app tree
// once as its `ClientSideOnlyWrapper` SSR fallback and again in the client tree,
// so the two briefly overlap. So every data-app history subscriber is multiplexed
// through a single `history.listen`, fanned out to each callback, and they never
// collide on that single slot.
const historyListeners = new Set<() => void>();
let unlistenHistory: (() => void) | null = null;

export function subscribeToDataAppHistory(callback: () => void): () => void {
  historyListeners.add(callback);

  unlistenHistory ??= getRawBrowserHistory().listen(() => {
    // Snapshot so a callback that unsubscribes mid-notify can't mutate the set
    // being iterated.
    for (const listener of Array.from(historyListeners)) {
      listener();
    }
  });

  return () => {
    historyListeners.delete(callback);

    if (historyListeners.size === 0) {
      unlistenHistory?.();
      unlistenHistory = null;
    }
  };
}

interface DataAppRouterProps {
  children?: ReactNode;
}

/**
 * Wrap your data-app tree once. Inside, use `<DataAppLink to="…">` for
 * navigation and `useDataAppLocation()` to read the current path.
 *
 * No `basename` prop: the basename is auto-detected from the iframe URL
 * (`/embed/apps/<name>`). In the dev preview where there's no prefix,
 * the same code works — `basename` resolves to `""` and the sub-path is
 * just the raw pathname.
 */
export const DataAppRouter = ({ children }: DataAppRouterProps) => (
  <>{children}</>
);
