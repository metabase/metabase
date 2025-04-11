import MetabaseSettings from "metabase/lib/settings";
import {
  PLUGIN_APP_INIT_FUNCTIONS,
  PLUGIN_LANDING_PAGE,
  PLUGIN_LOGO_ICON_COMPONENTS,
  PLUGIN_SELECTORS,
  PLUGIN_WHITELABEL,
} from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import {
  getApplicationName,
  getIsWhiteLabeling,
  getLandingPageIllustration,
  getLoadingMessage,
  getLoginPageIllustration,
  getNoDataIllustration,
  getNoObjectIllustration,
  getShowMetabaseLinks,
} from "metabase-enterprise/settings/selectors";

import { LandingPageWidget } from "./components/LandingPageWidget";
import LogoIcon from "./components/LogoIcon";
import { WhiteLabelSettingsPage } from "./components/WhiteLabelSettingsPage";
import { updateColors } from "./lib/whitelabel";

if (hasPremiumFeature("whitelabel")) {
  PLUGIN_LANDING_PAGE.getLandingPage = () =>
    MetabaseSettings.get("landing-page");
  PLUGIN_LANDING_PAGE.LandingPageWidget = LandingPageWidget;

  PLUGIN_WHITELABEL.WhiteLabelSettingsPage = WhiteLabelSettingsPage;

  PLUGIN_APP_INIT_FUNCTIONS.push(() => {
    updateColors();
  });

  PLUGIN_LOGO_ICON_COMPONENTS.push(LogoIcon);
  PLUGIN_SELECTORS.canWhitelabel = () => true;

  // these selectors control whitelabeling UI
  PLUGIN_SELECTORS.getLoadingMessageFactory = getLoadingMessage;
  PLUGIN_SELECTORS.getIsWhiteLabeling = getIsWhiteLabeling;
  PLUGIN_SELECTORS.getApplicationName = getApplicationName;
  PLUGIN_SELECTORS.getShowMetabaseLinks = getShowMetabaseLinks;
  PLUGIN_SELECTORS.getLoginPageIllustration = getLoginPageIllustration;
  PLUGIN_SELECTORS.getLandingPageIllustration = getLandingPageIllustration;
  PLUGIN_SELECTORS.getNoDataIllustration = getNoDataIllustration;
  PLUGIN_SELECTORS.getNoObjectIllustration = getNoObjectIllustration;
}
