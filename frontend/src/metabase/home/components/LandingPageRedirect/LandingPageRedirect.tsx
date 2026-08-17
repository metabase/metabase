import { Navigate } from "metabase/router";
import { PLUGIN_LANDING_PAGE } from "metabase/whitelabel";

import { HomePage } from "../HomePage";

/**
 * Renders the home page, or redirects to the configured landing page.
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
