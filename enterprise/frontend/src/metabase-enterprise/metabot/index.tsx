import { IndexRoute } from "react-router";
import { t } from "ttag";

import { createAdminRouteGuard } from "metabase/admin/utils";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { Route } from "metabase/hoc/Title";
import { PLUGIN_METABOT, PLUGIN_REDUCERS } from "metabase/plugins";
import { MetabotPurchasePage } from "metabase-enterprise/metabot/components/MetabotAdmin/MetabotPurchasePage";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { Metabot } from "./components/Metabot";
import { MetabotAgentSettingsPage } from "./components/MetabotAdmin/MetabotAgentSettingsPage";
import { MetabotGeneralSettingsPage } from "./components/MetabotAdmin/MetabotGeneralSettingsPage";
import { getMetabotQuickLinks } from "./components/MetabotQuickLinks";
import { MetabotSearchButton } from "./components/MetabotSearchButton";
import { MetabotContext, MetabotProvider, defaultContext } from "./context";
import { useMetabotEnabled, useMetabotPaletteActions } from "./hooks";
import { getMetabotVisible, metabotReducer } from "./state";

if (hasPremiumFeature("metabot_v3")) {
  PLUGIN_METABOT.useMetabotEnabled = useMetabotEnabled;

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
      <IndexRoute component={MetabotGeneralSettingsPage} />
      <Route path="general" component={MetabotGeneralSettingsPage} />
      <Route path=":metabotId" component={MetabotAgentSettingsPage} />
    </Route>
  );

  PLUGIN_METABOT.defaultMetabotContextValue = defaultContext;
  PLUGIN_METABOT.MetabotContext = MetabotContext;
  PLUGIN_METABOT.getMetabotProvider = () => MetabotProvider;
  // TODO: make enterprise store + fix type
  PLUGIN_METABOT.getMetabotVisible =
    getMetabotVisible as unknown as typeof PLUGIN_METABOT.getMetabotVisible;
  PLUGIN_METABOT.useMetabotPalletteActions = useMetabotPaletteActions;

  PLUGIN_METABOT.SearchButton = MetabotSearchButton;

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
