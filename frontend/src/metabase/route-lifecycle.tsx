import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { HomePage } from "metabase/home/components/HomePage";
import { PLUGIN_LANDING_PAGE } from "metabase/plugins";
import { useDispatch, useSelector } from "metabase/redux";
import { loadCurrentUser } from "metabase/redux/user";
import { Navigate, useLocation, useParams } from "metabase/router";
import { getSetting } from "metabase/selectors/settings";
import { reload } from "metabase/utils/dom";

/**
 * Loads the current user before rendering the authenticated app, gating its
 * children until the request settles. Replaces the root route's `loadCurrentUser`
 * `onEnter`, whose `done` callback delayed rendering until the user was fetched.
 */
export function LoadCurrentUser({ children }: { children: ReactNode }) {
  const dispatch = useDispatch();
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    dispatch(loadCurrentUser()).then(() => {
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

/**
 * Sends users away from `/setup` once the instance has been set up. Replaces the
 * `/setup` route's redirecting `onEnter`.
 */
export function RedirectIfSetup({ children }: { children: ReactNode }) {
  const hasUserSetup = useSelector((state) =>
    getSetting(state, "has-user-setup"),
  );

  return hasUserSetup ? <Navigate to="/" replace /> : <>{children}</>;
}

/**
 * Renders the home page, or redirects to the configured landing page. Replaces
 * the `/` route's redirecting `onEnter`.
 */
export function LandingPageRedirect() {
  const page = PLUGIN_LANDING_PAGE.getLandingPage();

  if (page && page !== "/") {
    const pathname = page.startsWith("/") ? page : `/${page}`;
    return (
      <Navigate
        to={{ pathname }}
        state={{ preserveNavbarState: true }}
        replace
      />
    );
  }

  return <HomePage />;
}

/**
 * Reloads the page so the backend can pick the SSO flow back up. Replaces the
 * `/auth/sso` routes' `onEnter`.
 */
export function SsoReload() {
  useEffect(() => {
    reload();
  }, []);

  return null;
}

/**
 * Redirects `/q` to `/question`, preserving the hash. Replaces the deprecated
 * route's `onEnter` (a plain `<Redirect>` drops the hash).
 */
export function QuestionHashRedirect() {
  const location = useLocation();

  return (
    <Navigate to={{ pathname: "/question", hash: location.hash }} replace />
  );
}

/**
 * Redirects `/card/:slug` to `/question/:slug`, preserving the hash. Replaces the
 * deprecated route's `onEnter` (a plain `<Redirect>` drops the hash).
 */
export function CardHashRedirect() {
  const location = useLocation();
  const { slug } = useParams();

  return (
    <Navigate
      to={{ pathname: `/question/${slug}`, hash: location.hash }}
      replace
    />
  );
}
