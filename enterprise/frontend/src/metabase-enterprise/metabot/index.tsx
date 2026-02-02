import { Route } from "react-router";

import { PLUGIN_METABOT, PLUGIN_REDUCERS } from "metabase/plugins";
import { useLazyMetabotGenerateContentQuery } from "metabase-enterprise/api";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { Metabot } from "./components/Metabot";
import { getAdminRoutes } from "./components/MetabotAdmin/MetabotAdminPage";
import { getAdminRoutes as getAdminUpsellRoutes } from "./components/MetabotAdmin/MetabotPurchasePage";
import { MetabotAppBarButton } from "./components/MetabotAppBarButton";
import MetabotThinkingStyles from "./components/MetabotChat/MetabotThinking.module.css";
import { MetabotDataStudioButton } from "./components/MetabotDataStudioButton";
import { MetabotDataStudioSidebar } from "./components/MetabotDataStudioSidebar";
import { MetabotQueryBuilder } from "./components/MetabotQueryBuilder";
import { getMetabotQuickLinks } from "./components/MetabotQuickLinks";
import { getNewMenuItemAIExploration } from "./components/NewMenuItemAIExploration";
import { MetabotContext, MetabotProvider, defaultContext } from "./context";
import { useMetabotSQLSuggestion as useMetabotSQLSuggestionEE } from "./hooks";
import {
  deactivateSuggestedTransform,
  getMetabotSuggestedTransform,
  getMetabotVisible,
  metabotReducer,
} from "./state";

/**
 * This is for Metabot in embedding
 *
 * TODO: Move this under a feature flag, but then we need to make our
 * store allowing injecting reducers dynamically since the store would
 * already be created before PLUGIN_REDUCERS.* is set via the dynamic EE plugin.
 */
PLUGIN_METABOT.getMetabotProvider = () => MetabotProvider;
PLUGIN_METABOT.defaultMetabotContextValue = defaultContext;
PLUGIN_METABOT.MetabotContext = MetabotContext;

PLUGIN_REDUCERS.metabotPlugin = metabotReducer;

/**
 * Initialize metabot plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("metabot_v3")) {
    Object.assign(PLUGIN_METABOT, {
      // helpers
      isEnabled: () => true,
      getNewMenuItemAIExploration,
      getMetabotVisible,
      // routes
      getAdminRoutes,
      getMetabotRoutes: getMetabotQuickLinks,
      getMetabotQueryBuilderRoute: () => (
        <Route path="ask" component={MetabotQueryBuilder} />
      ),
      // components
      Metabot,
      MetabotAppBarButton,
      MetabotDataStudioButton,
      MetabotDataStudioSidebar,
      MetabotThinkingStyles,
      // hooks
      useMetabotSQLSuggestion: useMetabotSQLSuggestionEE,
      useLazyMetabotGenerateContentQuery,
      getMetabotSuggestedTransform,
      deactivateSuggestedTransform,
    });
  } else if (hasPremiumFeature("hosting")) {
    Object.assign(PLUGIN_METABOT, {
      getAdminRoutes: getAdminUpsellRoutes,
    });
  }
}
