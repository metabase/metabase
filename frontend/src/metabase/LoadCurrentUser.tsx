import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { loadCurrentUser } from "metabase/current-user";
import { useDispatch } from "metabase/redux";
import { Outlet } from "metabase/router";
import { joinSiteSettingsRequest } from "metabase/settings";

/**
 * Loads the current user before rendering the authenticated app, gating its
 * children until the request settles. The route guards below it read
 * `currentUser`, so they must not run before it has been fetched.
 *
 * With a user, it also waits for the settings request in flight. The page only
 * carries the public settings, so the app would otherwise render before the
 * rest has arrived.
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
    const load = async () => {
      const { isSuccess: hasUser } = await dispatch(loadCurrentUser());
      if (hasUser) {
        await dispatch(joinSiteSettingsRequest());
      }
    };
    load().finally(() => {
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
