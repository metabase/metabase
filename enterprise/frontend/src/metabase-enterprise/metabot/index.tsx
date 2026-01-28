import { IndexRoute, Route } from "react-router";
import { t } from "ttag";

import { createAdminRouteGuard } from "metabase/admin/utils";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import type { MetabotContext as MetabotContextType } from "metabase/metabot";
import { PLUGIN_METABOT, PLUGIN_REDUCERS } from "metabase/plugins";
import { useLazyMetabotGenerateContentQuery } from "metabase-enterprise/api";
import { MetabotPurchasePage } from "metabase-enterprise/metabot/components/MetabotAdmin/MetabotPurchasePage";
import { MetabotDataStudioSidebar } from "metabase-enterprise/metabot/components/MetabotDataStudioSidebar";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { Metabot } from "./components/Metabot";
import { MetabotAdminPage } from "./components/MetabotAdmin/MetabotAdminPage";
import { MetabotTrialPage } from "./components/MetabotAdmin/MetabotTrialPage";
import { MetabotAppBarButton } from "./components/MetabotAppBarButton";
import { MetabotChat } from "./components/MetabotChat";
import MetabotThinkingStyles from "./components/MetabotChat/MetabotThinking.module.css";
import { MetabotDataStudioButton } from "./components/MetabotDataStudioButton";
import { useInlineSQLPrompt } from "./components/MetabotInlineSQLPrompt";
import { MetabotQueryBuilder } from "./components/MetabotQueryBuilder";
import { getMetabotQuickLinks } from "./components/MetabotQuickLinks";
import { getNewMenuItemAIExploration } from "./components/NewMenuItemAIExploration";
import { MetabotContext, MetabotProvider, defaultContext } from "./context";
import { getMetabotVisible, metabotReducer } from "./state";

/**
 * This is for Metabot in embedding
 *
 * TODO: Move this under a feature flag, but then we need to make our
 * store allowing injecting reducers dynamically since the store would
 * already be created before PLUGIN_REDUCERS.* is set via the dynamic EE plugin.
 */
PLUGIN_METABOT.getMetabotProvider = () => MetabotProvider;
PLUGIN_METABOT.defaultMetabotContextValue = defaultContext;
PLUGIN_METABOT.MetabotContext =
  MetabotContext as React.Context<MetabotContextType>;

PLUGIN_REDUCERS.metabotPlugin = metabotReducer;

/**
 * Initialize metabot plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("metabot_v3")) {
    PLUGIN_METABOT.isEnabled = () => true;
    PLUGIN_METABOT.Metabot = Metabot;
    PLUGIN_METABOT.MetabotChat = MetabotChat;
    PLUGIN_METABOT.getMetabotRoutes = getMetabotQuickLinks;

    PLUGIN_METABOT.getAdminPaths = () => [
      {
        name: t`AI`,
        path: "/admin/metabot",
        key: "metabot",
      },
    ];
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
    PLUGIN_METABOT.getAdminPaths = () => [
      {
        name: t`AI`,
        path: "/admin/metabot",
        key: "metabot",
      },
    ];
    PLUGIN_METABOT.getAdminRoutes = () => (
      <Route path="metabot" component={createAdminRouteGuard("metabot")}>
        <Route component={AdminSettingsLayout}>
          <IndexRoute component={MetabotPurchasePage} />
        </Route>
      </Route>
    );
  } else if (hasPremiumFeature("offer_metabase_ai")) {
    PLUGIN_METABOT.getAdminPaths = () => [
      {
        name: t`AI`,
        path: "/admin/metabot",
        key: "metabot",
      },
    ];
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
