import { t } from "ttag";
import {
  PLUGIN_APP_INIT_FUCTIONS,
  PLUGIN_LANDING_PAGE,
  PLUGIN_LOGO_ICON_COMPONENTS,
  PLUGIN_ADMIN_SETTINGS_UPDATES,
  PLUGIN_SELECTORS,
} from "metabase/plugins";

import { hasPremiumFeature } from "metabase-enterprise/settings";
import {
  getApplicationName,
  getIsWhiteLabeling,
  getLoadingMessage,
  getShowMetabaseLinks,
} from "metabase-enterprise/settings/selectors";
import MetabaseSettings from "metabase/lib/settings";

import { Anchor, Text } from "metabase/ui";
import RedirectWidget from "metabase/admin/settings/components/widgets/RedirectWidget";
import ColorSettingsWidget from "./components/ColorSettingsWidget";
import FontWidget from "./components/FontWidget";
import { LandingPageWidget } from "./components/LandingPageWidget";
import FontFilesWidget from "./components/FontFilesWidget";
import LighthouseToggleWidget from "./components/LighthouseToggleWidget";
import MetabotToggleWidget from "./components/MetabotToggleWidget";
import { ImageUpload } from "./components/ImageUpload";
import LogoIcon from "./components/LogoIcon";
import { updateColors } from "./lib/whitelabel";
import { getLoadingMessageOptions } from "./lib/loading-message";
import { HelpLinkSettings } from "./components/HelpLinkSettings";
import {
  MetabaseLinksToggleDescription,
  MetabaseLinksToggleWidget,
} from "./components/MetabaseLinksToggleWidget";

if (hasPremiumFeature("whitelabel")) {
  PLUGIN_LANDING_PAGE.push(() => MetabaseSettings.get("landing-page"));
  PLUGIN_ADMIN_SETTINGS_UPDATES.push(sections => ({
    whitelabel: {
      name: t`Appearance`,
      key: "-redirect-to-branding",
      settings: [
        {
          key: "-redirect-to-branding",
          widget: () => (
            <RedirectWidget to="/admin/settings/whitelabel/branding" />
          ),
        },
      ],
    },
    "whitelabel/branding": {
      tabs: [
        {
          name: t`Branding`,
          key: "branding",
          to: "/admin/settings/whitelabel/branding",
          isActive: true,
        },
        {
          name: t`Conceal Metabase`,
          key: "conceal-metabase",
          to: "/admin/settings/whitelabel/conceal-metabase",
        },
      ],
      settings: [
        // 1. Branding tab
        {
          key: "-branding-introduction",
          widget: () => (
            <Text>
              {t`Configure your instance to match your brand visuals and voice`}
            </Text>
          ),
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
          note: (
            <Text size="sm" color="text-light">
              {t`For best results, use an SVG file with a transparent
              background.`}
            </Text>
          ),
          type: "string",
          widget: ImageUpload,
        },
        {
          key: "application-font",
          display_name: t`Font`,
          widget: FontWidget,
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
          key: "application-favicon-url",
          display_name: t`Favicon`,
          type: "string",
          widget: ImageUpload,
        },
      ],
    },
    "whitelabel/conceal-metabase": {
      tabs: [
        {
          name: t`Branding`,
          key: "branding",
          to: "/admin/settings/whitelabel/branding",
        },
        {
          name: t`Conceal Metabase`,
          key: "conceal-metabase",
          to: "/admin/settings/whitelabel/conceal-metabase",
          isActive: true,
        },
      ],
      settings: [
        // 2. Conceal Metabase tab
        {
          key: "-conceal-metabase-introduction",
          tab: "conceal-metabase",
          widget: () => (
            <Text>
              {t`Hide or customize pieces of the Metabase product to tailor the experience to your brand and needs`}
            </Text>
          ),
        },
        {
          key: "application-name",
          tab: "conceal-metabase",
          display_name: t`Application Name`,
          type: "string",
        },
        {
          key: "show-lighthouse-illustration",
          tab: "conceal-metabase",
          display_name: t`Lighthouse illustration`,
          description: null,
          type: "boolean",
          widget: LighthouseToggleWidget,
          defaultValue: true,
        },
        {
          key: "show-metabase-links",
          tab: "conceal-metabase",
          display_name: t`Documentation and references`,
          description: <MetabaseLinksToggleDescription />,
          widget: MetabaseLinksToggleWidget,
        },
        {
          key: "show-metabot",
          tab: "conceal-metabase",
          display_name: t`Metabot greeting`,
          description: null,
          type: "boolean",
          widget: MetabotToggleWidget,
          defaultValue: true,
        },
        {
          key: "help-link",
          tab: "conceal-metabase",
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
      ],
    },
    ...sections,
  }));

  PLUGIN_APP_INIT_FUCTIONS.push(() => {
    updateColors();
    MetabaseSettings.on("application-colors", updateColors);
  });

  PLUGIN_LOGO_ICON_COMPONENTS.push(LogoIcon);
  PLUGIN_SELECTORS.canWhitelabel = () => true;

  // these selectors control whitelabeling UI
  PLUGIN_SELECTORS.getLoadingMessage = getLoadingMessage;
  PLUGIN_SELECTORS.getIsWhiteLabeling = getIsWhiteLabeling;
  PLUGIN_SELECTORS.getApplicationName = getApplicationName;
  PLUGIN_SELECTORS.getShowMetabaseLinks = getShowMetabaseLinks;
}
