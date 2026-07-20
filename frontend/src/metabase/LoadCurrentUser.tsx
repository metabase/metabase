import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { useDispatch } from "metabase/redux";
import { loadCurrentUser } from "metabase/redux/user";
import { Outlet } from "metabase/router";

/**
 * Loads the current user before rendering the authenticated app, gating its
 * children until the request settles. The route guards below it read
 * `currentUser`, so they must not run before it has been fetched.
 */
export function LoadCurrentUser({
  children = <Outlet />,
}: {
  children?: ReactNode;
}) {
  const dispatch = useDispatch();
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    dispatch(loadCurrentUser()).finally(() => {
      if (!cancelled) {
        setIsLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  return isLoaded ? <>{children}</> : null;
}
