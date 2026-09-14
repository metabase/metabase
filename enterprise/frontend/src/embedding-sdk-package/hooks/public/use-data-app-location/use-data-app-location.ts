import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getBasename,
  navigate,
  subscribeToDataAppRouting,
} from "embedding-sdk-package/lib/private/data-app-routing";

export type UseDataAppLocationResult = {
  pathname: string;
  navigate: (to: string) => void;
};

const computeSubPath = (basename: string): string => {
  if (typeof window === "undefined") {
    return "/";
  }

  const pathname = window.location.pathname;
  const subPath =
    basename && pathname.startsWith(basename)
      ? pathname.slice(basename.length)
      : pathname;

  return subPath || "/";
};

/**
 * The current data-app sub-path and a `navigate` function.
 *
 * Paths are relative to the data-app root: `/`, `/customers/42`, etc.
 * `navigate(to)` switches sub-path without a full reload.
 */
export const useDataAppLocation = (): UseDataAppLocationResult => {
  // Never changes after mount: the iframe doesn't navigate to a different
  // `<name>` — that is a parent-level route change, which remounts the iframe.
  const basename = useMemo(() => getBasename(), []);
  const [pathname, setPathname] = useState(() => computeSubPath(basename));

  useEffect(
    () =>
      subscribeToDataAppRouting(() => {
        setPathname(computeSubPath(basename));
      }),
    [basename],
  );

  const handleNavigate = useCallback((to: string) => navigate(to), []);

  return { pathname, navigate: handleNavigate };
};
