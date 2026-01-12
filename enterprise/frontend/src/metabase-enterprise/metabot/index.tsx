import { IndexRoute, Route } from "react-router";

import { createAdminRouteGuard } from "metabase/admin/utils";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { getMetabotVisible } from "metabase/metabot/state";
import { PLUGIN_METABOT } from "metabase/plugins";
import { useLazyMetabotGenerateContentQuery } from "metabase-enterprise/api";
import { MetabotPurchasePage } from "metabase-enterprise/metabot/components/MetabotAdmin/MetabotPurchasePage";
import { MetabotDataStudioSidebar } from "metabase-enterprise/metabot/components/MetabotDataStudioSidebar";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { MetabotAdminPage } from "./components/MetabotAdmin/MetabotAdminPage";
import { MetabotTrialPage } from "./components/MetabotAdmin/MetabotTrialPage";
import { MetabotAppBarButton } from "./components/MetabotAppBarButton";
import MetabotThinkingStyles from "./components/MetabotChat/MetabotThinking.module.css";
import { MetabotChatSidebar } from "./components/MetabotChatSidebar";
import { MetabotDataStudioButton } from "./components/MetabotDataStudioButton";
import { useInlineSQLPrompt } from "./components/MetabotInlineSQLPrompt";
import { MetabotQueryBuilder } from "./components/MetabotQueryBuilder";
import { getMetabotQuickLinks } from "./components/MetabotQuickLinks";
import { getNewMenuItemAIExploration } from "./components/NewMenuItemAIExploration";

/**
 * Initialize metabot plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("metabot_v3")) {
    PLUGIN_METABOT.isOmnibotEnabled = () => true;
    PLUGIN_METABOT.MetabotChatSidebar = MetabotChatSidebar;
    PLUGIN_METABOT.getMetabotRoutes = getMetabotQuickLinks;

    PLUGIN_METABOT.getAdminRoutes = () => (
      <Route
        key="metabot"
        path="metabot"
        component={createAdminRouteGuard("metabot")}
      >
        <IndexRoute component={MetabotAdminPage} />
        <Route path=":metabotId" component={MetabotAdminPage} />
      </Route>
    );

    PLUGIN_METABOT.getMetabotVisible =
      getMetabotVisible as unknown as typeof PLUGIN_METABOT.getMetabotVisible;

    PLUGIN_METABOT.MetabotAppBarButton = MetabotAppBarButton;
    PLUGIN_METABOT.MetabotDataStudioButton = MetabotDataStudioButton;
    PLUGIN_METABOT.MetabotDataStudioSidebar = MetabotDataStudioSidebar;
    PLUGIN_METABOT.getMetabotQueryBuilderRoute = () => (
      <Route path="ask" component={MetabotQueryBuilder} />
    );
    PLUGIN_METABOT.getNewMenuItemAIExploration = getNewMenuItemAIExploration;
    PLUGIN_METABOT.useLazyMetabotGenerateContentQuery =
      useLazyMetabotGenerateContentQuery;
    PLUGIN_METABOT.MetabotThinkingStyles = MetabotThinkingStyles;
  } else if (hasPremiumFeature("offer_metabase_ai_tiered")) {
    PLUGIN_METABOT.getAdminRoutes = () => (
      <Route path="metabot" component={createAdminRouteGuard("metabot")}>
        <Route component={AdminSettingsLayout}>
          <IndexRoute component={MetabotPurchasePage} />
        </Route>
      </Route>
    );
  } else if (hasPremiumFeature("offer_metabase_ai")) {
    PLUGIN_METABOT.getAdminRoutes = () => (
      <Route path="metabot" component={createAdminRouteGuard("metabot")}>
        <Route component={AdminSettingsLayout}>
          <IndexRoute component={MetabotTrialPage} />
        </Route>
      </Route>
    );
    PLUGIN_METABOT.useLazyMetabotGenerateContentQuery =
      useLazyMetabotGenerateContentQuery;
    PLUGIN_METABOT.MetabotThinkingStyles = MetabotThinkingStyles;
  }
  PLUGIN_METABOT.useInlineSQLPrompt = useInlineSQLPrompt;
}
