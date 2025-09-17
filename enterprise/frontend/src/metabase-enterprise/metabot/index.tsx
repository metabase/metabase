import { useMemo } from "react";
import { IndexRoute } from "react-router";
import { t } from "ttag";

import { createAdminRouteGuard } from "metabase/admin/utils";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { Route } from "metabase/hoc/Title";
import type { PaletteAction } from "metabase/palette/types";
import { PLUGIN_METABOT, PLUGIN_REDUCERS } from "metabase/plugins";
import { MetabotPurchasePage } from "metabase-enterprise/metabot/components/MetabotAdmin/MetabotPurchasePage";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { Metabot } from "./components/Metabot";
import { MetabotAdminPage } from "./components/MetabotAdmin/MetabotAdminPage";
import { getMetabotQuickLinks } from "./components/MetabotQuickLinks";
import { MetabotSearchButton } from "./components/MetabotSearchButton";
import { MetabotToggleButton } from "./components/MetabotToggleButton";
import { MetabotContext, MetabotProvider, defaultContext } from "./context";
import { useMetabotAgent } from "./hooks";
import { getMetabotVisible, metabotReducer } from "./state";

if (hasPremiumFeature("metabot_v3")) {
  PLUGIN_METABOT.isEnabled = () => true;
  PLUGIN_METABOT.Metabot = Metabot;

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

  PLUGIN_METABOT.defaultMetabotContextValue = defaultContext;
  PLUGIN_METABOT.MetabotContext = MetabotContext;
  PLUGIN_METABOT.getMetabotProvider = () => MetabotProvider;
  // TODO: make enterprise store + fix type
  PLUGIN_METABOT.getMetabotVisible =
    getMetabotVisible as unknown as typeof PLUGIN_METABOT.getMetabotVisible;
  PLUGIN_METABOT.useMetabotPalletteActions = (searchText: string) => {
    const { startNewConversation } = useMetabotAgent();

    return useMemo(() => {
      const ret: PaletteAction[] = [
        {
          id: "initialize_metabot",
          name: searchText
            ? t`Ask Metabot, "${searchText}"`
            : t`Ask me to do something, or ask me a question`,
          section: "metabot",
          keywords: searchText,
          icon: "metabot",
          perform: () => startNewConversation(searchText),
        },
      ];
      return ret;
    }, [searchText, startNewConversation]);
  };

  PLUGIN_METABOT.SearchButton = MetabotSearchButton;
  PLUGIN_METABOT.MetabotToggleButton = MetabotToggleButton;

  PLUGIN_REDUCERS.metabotPlugin = metabotReducer;
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
      <Route title={t`AI`} component={AdminSettingsLayout}>
        <IndexRoute component={MetabotPurchasePage} />
      </Route>
    </Route>
  );
}

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
