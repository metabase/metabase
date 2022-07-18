import {
  PLUGIN_APP_INIT_FUCTIONS,
  PLUGIN_LANDING_PAGE,
  PLUGIN_LOGO_ICON_COMPONENTS,
  PLUGIN_ADMIN_SETTINGS_UPDATES,
  PLUGIN_SELECTORS,
} from "metabase/plugins";

import { t } from "ttag";

import { hasPremiumFeature } from "metabase-enterprise/settings";
import {
  getHasCustomColors,
  getLoadingMessage,
} from "metabase-enterprise/settings/selectors";
import MetabaseSettings from "metabase/lib/settings";

import ColorSettingsWidget from "./components/ColorSettingsWidget";
import FontWidget from "./components/FontWidget";
import FontFilesWidget from "./components/FontFilesWidget";
import LighthouseToggleWidget from "./components/LighthouseToggleWidget";
import MetabotToggleWidget from "./components/MetabotToggleWidget";
import LogoUpload from "./components/LogoUpload";
import LogoIcon from "./components/LogoIcon";
import {
  updateColors,
  enabledApplicationNameReplacement,
} from "./lib/whitelabel";
import { getLoadingMessageOptions } from "./lib/loading-message";

if (hasPremiumFeature("whitelabel")) {
  PLUGIN_LANDING_PAGE.push(() => MetabaseSettings.get("landing-page"));
  PLUGIN_ADMIN_SETTINGS_UPDATES.push(sections => ({
    whitelabel: {
      name: t`Appearance`,
      settings: [
        {
          key: "application-name",
          display_name: t`Application Name`,
          type: "string",
        },
        {
          key: "application-font",
          display_name: t`Font`,
          widget: FontWidget,
        },
        {
          key: "application-font-files",
          widget: FontFilesWidget,
          getHidden: settings => settings["application-font-files"] == null,
        },
        {
          key: "application-colors",
          display_name: t`Color Palette`,
          widget: ColorSettingsWidget,
        },
        {
          key: "application-logo-url",
          display_name: t`Logo`,
          type: "string",
          widget: LogoUpload,
        },
        {
          key: "application-favicon-url",
          display_name: t`Favicon`,
          type: "string",
        },
        {
          key: "landing-page",
          display_name: t`Landing Page`,
          type: "string",
          placeholder: "/",
        },
        {
          key: "loading-message",
          display_name: t`Loading message`,
          type: "select",
          options: getLoadingMessageOptions(),
          defaultValue: "doing-science",
        },
        {
          key: "show-metabot",
          display_name: t`Metabot`,
          description: null,
          type: "boolean",
          widget: MetabotToggleWidget,
          defaultValue: true,
        },
        {
          key: "show-lighthouse-illustration",
          display_name: t`Lighthouse illustration`,
          description: null,
          type: "boolean",
          widget: LighthouseToggleWidget,
          defaultValue: true,
        },
      ],
    },
    ...sections,
  }));

  PLUGIN_APP_INIT_FUCTIONS.push(() => {
    updateColors();
    MetabaseSettings.on("application-colors", updateColors);
  });

  enabledApplicationNameReplacement();

  PLUGIN_LOGO_ICON_COMPONENTS.push(LogoIcon);
  PLUGIN_SELECTORS.canWhitelabel = () => true;
}

// these selectors control whitelabeling UI
PLUGIN_SELECTORS.getHasCustomColors = getHasCustomColors;
PLUGIN_SELECTORS.getLoadingMessage = getLoadingMessage;
