import { Route } from "react-router";

import { getFullAdminRoutes } from "metabase/metabot/components/MetabotAdmin/MetabotAdminPage";
import { MetabotQueryBuilderOrFallback } from "metabase/metabot/components/MetabotQueryBuilderOrFallback";
import { useMetabotSQLSuggestion } from "metabase/metabot/hooks/use-metabot-sql-suggestion";
import { getMetabotRoutes } from "metabase/metabot/routes";
import { PLUGIN_METABOT } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { getAdminRoutes as getAdminUpsellRoutes } from "./components/MetabotAdmin/MetabotPurchasePage";

export function initializePlugin() {
  if (hasPremiumFeature("metabot_v3")) {
    Object.assign(PLUGIN_METABOT, {
      hasFeature: true,
      useMetabotSQLSuggestion,
      getAdminRoutes: getFullAdminRoutes,
      getMetabotRoutes: () => <>{getMetabotRoutes()}</>,
      getMetabotQueryBuilderRoute: () => (
        <Route path="ask" component={MetabotQueryBuilderOrFallback} />
      ),
    });
  } else if (hasPremiumFeature("hosting")) {
    Object.assign(PLUGIN_METABOT, {
      getAdminRoutes: getAdminUpsellRoutes,
    });
  }
}
