import { Route } from "react-router";

import { MetabotQueryBuilder } from "metabase/metabot/components/MetabotQueryBuilder";
import { getMetabotQuickLinks } from "metabase/metabot/components/MetabotQuickLinks";
import { SlackConnectSuccess } from "metabase/metabot/components/SlackConnectSuccess";
import { useMetabotEnabledEmbeddingAware } from "metabase/metabot/hooks";
import { PLUGIN_METABOT } from "metabase/plugins";
import { QueryBuilder } from "metabase/query_builder/containers/QueryBuilder";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { getAdminRoutes } from "./components/MetabotAdmin/MetabotAdminPage";
import { getAdminRoutes as getAdminUpsellRoutes } from "./components/MetabotAdmin/MetabotPurchasePage";
import { MetabotSlackSetup } from "./components/MetabotAdmin/MetabotSlackSetup";
import { useMetabotSQLSuggestion as useMetabotSQLSuggestionEE } from "./hooks";

/**
 * A wrapper component that renders MetabotQueryBuilder if metabot is enabled,
 * otherwise falls back to the regular QueryBuilder.
 */
function MetabotQueryBuilderOrFallback(props: any) {
  const isMetabotEnabled = useMetabotEnabledEmbeddingAware();
  return isMetabotEnabled ? (
    <MetabotQueryBuilder {...props} />
  ) : (
    <QueryBuilder {...props} />
  );
}

/**
 * Initialize metabot plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("metabot_v3")) {
    Object.assign(PLUGIN_METABOT, {
      // routes
      getAdminRoutes,
      getMetabotRoutes: () => (
        <>
          {getMetabotQuickLinks()}
          <Route path="slack-connect-success" component={SlackConnectSuccess} />
        </>
      ),
      getMetabotQueryBuilderRoute: () => (
        <Route path="ask" component={MetabotQueryBuilderOrFallback} />
      ),
      // components
      MetabotSlackSetup,
      // hooks
      useMetabotSQLSuggestion: useMetabotSQLSuggestionEE,
    });
  } else if (hasPremiumFeature("hosting")) {
    Object.assign(PLUGIN_METABOT, {
      getAdminRoutes: getAdminUpsellRoutes,
    });
  }
}
