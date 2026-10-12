import { NotFound } from "metabase/common/components/ErrorPages";
import { sessionManagementUpsellPage } from "metabase/monitor/routes";
import type { PluginRoute } from "metabase/plugins/types";
import { featureGatedRoute } from "metabase-enterprise/settings/feature-gated-route";

const sessionsPage = () =>
  import(
    /* webpackChunkName: "monitor-session-management" */ "./SessionsPage"
  ).then(({ SessionsPage }) => ({
    Component: SessionsPage,
  }));

const notFoundPage: PluginRoute = async () => ({ Component: NotFound });

export const sessionManagementPage = featureGatedRoute(
  "session-management",
  sessionsPage,
  sessionManagementUpsellPage,
);

/**
 * With the feature, an unknown URL under /monitor/sessions is a 404 the same
 * way it is under any other monitor section. Without it, every sessions URL
 * is the upsell.
 */
export const sessionManagementCatchAllPage = featureGatedRoute(
  "session-management",
  notFoundPage,
  sessionManagementUpsellPage,
);
