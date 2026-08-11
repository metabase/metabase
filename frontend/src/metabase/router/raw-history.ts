import {
  type HistoryRouterProps,
  UNSAFE_createBrowserHistory as createBrowserHistory,
} from "react-router";

// react-router does not export the `History` interface directly, so pull it off
// the history prop of `unstable_HistoryRouter`.
type History = HistoryRouterProps["history"];

let rawBrowserHistory: History | null = null;

/**
 * A plain browser history for imperative navigation outside the app's router
 * tree, replacing v3's global `browserHistory` singleton. The SDK data-app bundle
 * mounts no router, so it drives its iframe URL through this instead. Created
 * lazily on first use, so it never exists in the main app, where a second history
 * would fight the mounted router over `popstate`.
 */
export function getRawBrowserHistory(): History {
  rawBrowserHistory ??= createBrowserHistory({ v5Compat: true });
  return rawBrowserHistory;
}
