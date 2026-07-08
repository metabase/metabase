import { useCallback, useEffect, useMemo, useState } from "react";

import { browserHistory } from "metabase/router";

import { getBasename } from "./DataAppRouter";

const computeSubPath = (basename: string): string => {
  const pathname = window.location.pathname;
  const subPath =
    basename && pathname.startsWith(basename)
      ? pathname.slice(basename.length)
      : pathname;

  return subPath || "/";
};

/**
 * Returns the current data-app sub-path and a `navigate` function.
 *
 * Path is relative to the data-app root: `/`, `/customers/42`, etc.
 * `navigate(to)` switches to a new sub-path without a full reload.
 */
export const useDataAppLocation = (): {
  pathname: string;
  navigate: (to: string) => void;
} => {
  // Basename never changes after mount: the iframe doesn't navigate to a
  // different `<name>`; that'd be a parent-level route change which
  // re-mounts the iframe entirely.
  const basename = useMemo(() => getBasename(), []);
  const [pathname, setPathname] = useState(() => computeSubPath(basename));

  useEffect(() => {
    // `browserHistory.listen` fires for every navigation — `<Link>` clicks,
    // imperative `push` calls, and browser back/forward. One subscription
    // covers all of them.
    return browserHistory.listen(() => {
      setPathname(computeSubPath(basename));
    });
  }, [basename]);

  const navigate = useCallback(
    (to: string) => {
      // `to` is bundle-relative (e.g. "/customers/42"). The real URL is
      // `basename + to`.
      browserHistory.push(basename + to);
    },
    [basename],
  );

  return { pathname, navigate };
};
