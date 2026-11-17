import { ProtoHome } from "metabase/nav/containers/ProtoNavbar/ProtoHome";
import { PROTO_NAV_ENABLED } from "metabase/nav/containers/ProtoNavbar/flag";
import { PLUGIN_LANDING_PAGE } from "metabase/plugins";
import { Navigate } from "metabase/router";

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

  return PROTO_NAV_ENABLED ? <ProtoHome /> : <HomePage />;
}
