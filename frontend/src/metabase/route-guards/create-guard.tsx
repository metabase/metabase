import type { ReactElement, ReactNode } from "react";

import { useSelector } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { type Location, Navigate, Outlet, useLocation } from "metabase/router";

/**
 * Guards double as route elements and as wrapper components. As a route element
 * (`element={<IsAuthenticated/>}`) no `children` are passed, so they fall back to
 * `<Outlet/>` and render whatever nested route matched.
 */
type Props = { children?: ReactNode };

const NEVER_AUTHENTICATING = () => false;

type GuardSelectors = {
  isAllowed: (state: State) => boolean;
  isAuthenticating?: (state: State) => boolean;
};

/**
 * Builds a route guard component from redux selectors. When access is denied it
 * renders the element from `renderRedirect` instead of the guarded children.
 *
 * While `isAuthenticating` is true the guard renders nothing (no redirect and no
 * children), so a route is not bounced while its auth state is still resolving.
 */
export function createGuard(
  { isAllowed, isAuthenticating = NEVER_AUTHENTICATING }: GuardSelectors,
  renderRedirect: (
    location: Omit<Location, "query" | "action">,
  ) => ReactElement | null,
) {
  return function Guard({ children = <Outlet /> }: Props) {
    const location = useLocation();
    const allowed = useSelector(isAllowed);
    const authenticating = useSelector(isAuthenticating);

    if (allowed) {
      return children;
    }
    if (authenticating) {
      return null;
    }
    return renderRedirect(location);
  };
}

/**
 * Builds a guard that redirects to a fixed path when access is denied, the
 * common case with no `?redirect=` round-trip.
 */
export function createRedirectGuard(
  isAllowed: (state: State) => boolean,
  redirectPath: string,
) {
  return createGuard({ isAllowed }, () => (
    <Navigate to={redirectPath} replace />
  ));
}
