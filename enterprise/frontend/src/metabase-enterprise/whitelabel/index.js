import { updateIn } from "icepick";
import { jt, t } from "ttag";

import RedirectWidget from "metabase/admin/settings/components/widgets/RedirectWidget";
import { SettingSelect } from "metabase/admin/settings/components/widgets/SettingSelect";
import { SettingTextInput } from "metabase/admin/settings/components/widgets/SettingTextInput";
import MetabaseSettings from "metabase/lib/settings";
import {
  PLUGIN_ADMIN_SETTINGS_UPDATES,
  PLUGIN_APP_INIT_FUNCTIONS,
  PLUGIN_LANDING_PAGE,
  PLUGIN_LOGO_ICON_COMPONENTS,
  PLUGIN_SELECTORS,
} from "metabase/plugins";
import { Anchor, Text } from "metabase/ui";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import {
  getApplicationName,
  getIsWhiteLabeling,
  getLoadingMessage,
  getLoginPageIllustration,
  getLandingPageIllustration,
  getShowMetabaseLinks,
  getNoDataIllustration,
  getNoObjectIllustration,
} from "metabase-enterprise/settings/selectors";

import ColorSettingsWidget from "./components/ColorSettingsWidget";
import FontFilesWidget from "./components/FontFilesWidget";
import FontWidget from "./components/FontWidget";
import { HelpLinkSettings } from "./components/HelpLinkSettings";
import { IllustrationTitle } from "./components/IllustrationTitle";
import { IllustrationWidget } from "./components/IllustrationWidget";
import { ImageUpload } from "./components/ImageUpload";
import { LandingPageWidget } from "./components/LandingPageWidget";
import LogoIcon from "./components/LogoIcon";
import { MetabotToggleWidget } from "./components/MetabotToggleWidget";
import {
  MetabaseLinksToggleDescription,
  SwitchWidget,
} from "./components/SwitchWidget";
import { getLoadingMessageOptions } from "./lib/loading-message";
import { updateColors } from "./lib/whitelabel";

if (hasPremiumFeature("whitelabel")) {
  PLUGIN_LANDING_PAGE.push(() => MetabaseSettings.get("landing-page"));
  PLUGIN_ADMIN_SETTINGS_UPDATES.push(
    sections => ({
      ...sections,
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
            // eslint-disable-next-line no-literal-metabase-strings -- Admin settings
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
            key: "application-font-files",
            widget: FontFilesWidget,
            getHidden: settings => settings["application-font-files"] == null,
          },
          {
            key: "loading-message",
            display_name: t`Loading message`,
            widget: SettingSelect,
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
            // eslint-disable-next-line no-literal-metabase-strings -- Admin settings
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
            // eslint-disable-next-line no-literal-metabase-strings -- Admin settings
            description: t`Hide or customize pieces of the Metabase product to tailor the experience to your brand and needs`,
            type: "hidden",
          },
          {
            key: "application-name",
            tab: "conceal-metabase",
            display_name: t`Application Name`,
            widget: SettingTextInput,
          },
          {
            key: "show-metabase-links",
            tab: "conceal-metabase",
            display_name: t`Documentation and references`,
            // eslint-disable-next-line no-literal-metabase-strings -- Admin settings
            description: t`Control the display of Metabase documentation and Metabase references in your instance.`,
            widget: SwitchWidget,
            props: {
              // eslint-disable-next-line no-literal-metabase-strings -- Metabase settings
              label: jt`Show links and references to Metabase ${(
                <MetabaseLinksToggleDescription key="show-metabase-links-description-tooltip" />
              )}`,
            },
          },
          {
            key: "help-link",
            tab: "conceal-metabase",
            display_name: t`Help Link in the Settings menu`,
            description: (
              <p>
                {jt`Choose a target to the Help link in the Settings menu. It links to ${(
                  <Anchor
                    key="this-page"
                    href="https://www.metabase.com/help"
                  >{t`this page`}</Anchor>
                )} by default.`}
              </p>
            ),
            widget: HelpLinkSettings,
            defaultValue: "metabase",
          },
          {
            key: "-metabase-illustration",
            tab: "conceal-metabase",
            // eslint-disable-next-line no-literal-metabase-strings -- Admin settings
            display_name: t`Metabase illustrations`,
            // eslint-disable-next-line no-literal-metabase-strings -- Admin settings
            description: t`Customize each of the illustrations in Metabase`,
            type: "hidden",
          },
          {
            key: "show-metabot",
            tab: "conceal-metabase",
            display_name: (
              <Text fw="bold" transform="none">{t`Metabot greeting`}</Text>
            ),
            description: null,
            type: "boolean",
            defaultValue: true,
            widget: MetabotToggleWidget,
          },
          {
            key: "login-page-illustration",
            tab: "conceal-metabase",
            display_name: (
              <IllustrationTitle
                title={t`Login and unsubscribe pages`}
                errorMessageContainerId="login-page-illustration-error-container"
              />
            ),
            description: null,
            type: "string",
            widget: IllustrationWidget,
            props: {
              type: "background",
              customIllustrationSetting: "login-page-illustration-custom",
              errorMessageContainerId:
                "login-page-illustration-error-container",
            },
          },
          {
            key: "landing-page-illustration",
            tab: "conceal-metabase",
            display_name: (
              <IllustrationTitle
                title={t`Landing page`}
                errorMessageContainerId="landing-page-illustration-error-container"
              />
            ),
            description: null,
            type: "string",
            widget: IllustrationWidget,
            props: {
              type: "background",
              customIllustrationSetting: "landing-page-illustration-custom",
              errorMessageContainerId:
                "landing-page-illustration-error-container",
            },
          },
          {
            key: "no-data-illustration",
            tab: "conceal-metabase",
            display_name: (
              <IllustrationTitle
                title={t`When calculations return no results`}
                errorMessageContainerId="no-data-illustration-error-container"
              />
            ),
            description: null,
            type: "string",
            widget: IllustrationWidget,
            props: {
              type: "icon",
              customIllustrationSetting: "no-data-illustration-custom",
              errorMessageContainerId: "no-data-illustration-error-container",
            },
          },
          {
            key: "no-object-illustration",
            tab: "conceal-metabase",
            display_name: (
              <IllustrationTitle
                title={t`When no objects can be found`}
                errorMessageContainerId="no-object-illustration-error-container"
              />
            ),
            description: null,
            type: "string",
            widget: IllustrationWidget,
            props: {
              type: "icon",
              customIllustrationSetting: "no-object-illustration-custom",
              errorMessageContainerId: "no-object-illustration-error-container",
            },
          },
        ],
      },
    }),
    sections => {
      return updateIn(sections, ["general", "settings"], settings => {
        const customHomepageIndex = settings.findIndex(
          setting => setting.key === "custom-homepage-dashboard",
        );
        return [
          ...settings.slice(0, customHomepageIndex + 1),
          {
            key: "landing-page",
            display_name: t`Landing Page`,
            type: "string",
            placeholder: "/",
            widget: LandingPageWidget,
          },
          ...settings.slice(customHomepageIndex + 1),
        ];
      });
    },
  );

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
