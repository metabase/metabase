import { t } from "ttag";

import MetabaseSettings from "metabase/lib/settings";
import {
  PLUGIN_APP_INIT_FUNCTIONS,
  PLUGIN_LANDING_PAGE,
  PLUGIN_LOGO_ICON_COMPONENTS,
  PLUGIN_ADMIN_SETTINGS_UPDATES,
  PLUGIN_SELECTORS,
} from "metabase/plugins";
import { Anchor } from "metabase/ui";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import {
  getApplicationName,
  getIsWhiteLabeling,
  getLoadingMessage,
  getShowMetabaseLinks,
} from "metabase-enterprise/settings/selectors";

import ColorSettingsWidget from "./components/ColorSettingsWidget";
import FontFilesWidget from "./components/FontFilesWidget";
import FontWidget from "./components/FontWidget";
import { HelpLinkSettings } from "./components/HelpLinkSettings";
import { LandingPageWidget } from "./components/LandingPageWidget";
import LighthouseToggleWidget from "./components/LighthouseToggleWidget";
import LogoIcon from "./components/LogoIcon";
import LogoUpload from "./components/LogoUpload";
import {
  MetabaseLinksToggleDescription,
  MetabaseLinksToggleWidget,
} from "./components/MetabaseLinksToggleWidget";
import MetabotToggleWidget from "./components/MetabotToggleWidget";
import { getLoadingMessageOptions } from "./lib/loading-message";
import { updateColors } from "./lib/whitelabel";

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
          widget: LandingPageWidget,
        },
        {
          key: "loading-message",
          display_name: t`Loading message`,
          type: "select",
          options: getLoadingMessageOptions(),
          defaultValue: "doing-science",
        },
        {
          key: "help-link",
          display_name: t`Help Link in the Settings menu`,
          description: (
            <p>
              {t`The Settings menu includes a Help link that goes to `}
              <Anchor href="https://www.metabase.com/help">{t`this page`}</Anchor>
              {t` by default.`}
            </p>
          ),
          widget: HelpLinkSettings,
          defaultValue: "metabase",
        },
        {
          key: "show-metabot",
          display_name: t`Metabot greeting`,
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
        {
          key: "show-metabase-links",
          display_name: t`Documentation and references`,
          description: <MetabaseLinksToggleDescription />,
          widget: MetabaseLinksToggleWidget,
        },
      ],
    },
    ...sections,
  }));

  PLUGIN_APP_INIT_FUNCTIONS.push(() => {
    updateColors();
    MetabaseSettings.on("application-colors", updateColors);
  });

  PLUGIN_LOGO_ICON_COMPONENTS.push(LogoIcon);
  PLUGIN_SELECTORS.canWhitelabel = () => true;

  // these selectors control whitelabeling UI
  PLUGIN_SELECTORS.getLoadingMessageFactory = getLoadingMessage;
  PLUGIN_SELECTORS.getIsWhiteLabeling = getIsWhiteLabeling;
  PLUGIN_SELECTORS.getApplicationName = getApplicationName;
  PLUGIN_SELECTORS.getShowMetabaseLinks = getShowMetabaseLinks;
}
