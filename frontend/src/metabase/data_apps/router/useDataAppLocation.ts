import { useContext } from "react";

import { DataAppRouterContext } from "./DataAppRouter";

/**
 * Returns the current data-app sub-path and a `navigate` function.
 *
 * Path is relative to the data-app root: `/`, `/customers/42`, etc.
 * `navigate(to)` switches to a new sub-path without a full reload.
 *
 * Must be called inside a `<DataAppRouter>` subtree.
 */
export function useDataAppLocation(): {
  pathname: string;
  navigate: (to: string) => void;
} {
  const ctx = useContext(DataAppRouterContext);
  if (!ctx) {
    throw new Error(
      "useDataAppLocation must be called inside a <DataAppRouter>",
    );
  }
  return { pathname: ctx.pathname, navigate: ctx.navigate };
}
