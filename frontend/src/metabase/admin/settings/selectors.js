import { createSelector } from "@reduxjs/toolkit";
import { t } from "ttag";
import _ from "underscore";

import { SMTPConnectionForm } from "metabase/admin/settings/components/Email/SMTPConnectionForm";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import { DashboardSelector } from "metabase/components/DashboardSelector";
import MetabaseSettings from "metabase/lib/settings";
import {
  PLUGIN_ADMIN_SETTINGS_UPDATES,
  PLUGIN_ADMIN_SETTINGS_AUTH_TABS,
  PLUGIN_EMBEDDING,
  PLUGIN_LLM_AUTODESCRIPTION,
} from "metabase/plugins";
import { refreshCurrentUser } from "metabase/redux/user";
import { getUserIsAdmin } from "metabase/selectors/user";

import {
  trackCustomHomepageDashboardEnabled,
  trackTrackingPermissionChanged,
} from "./analytics";
import { CloudPanel } from "./components/CloudPanel";
import { BccToggleWidget } from "./components/Email/BccToggleWidget";
import { SettingsEmailForm } from "./components/Email/SettingsEmailForm";
import SettingsLicense from "./components/SettingsLicense";
import SettingsUpdatesForm from "./components/SettingsUpdatesForm/SettingsUpdatesForm";
import { UploadSettings } from "./components/UploadSettings";
import CustomGeoJSONWidget from "./components/widgets/CustomGeoJSONWidget";
import {
  InteractiveEmbeddingOptionCard,
  StaticEmbeddingOptionCard,
} from "./components/widgets/EmbeddingOption";
import { EmbeddingSwitchWidget } from "./components/widgets/EmbeddingSwitchWidget";
import FormattingWidget from "./components/widgets/FormattingWidget";
import HttpsOnlyWidget from "./components/widgets/HttpsOnlyWidget";
import {
  EmbeddedResources,
  PublicLinksActionListing,
  PublicLinksDashboardListing,
  PublicLinksQuestionListing,
} from "./components/widgets/PublicLinksListing";
import RedirectWidget from "./components/widgets/RedirectWidget";
import SecretKeyWidget from "./components/widgets/SecretKeyWidget";
import SettingCommaDelimitedInput from "./components/widgets/SettingCommaDelimitedInput";
import SiteUrlWidget from "./components/widgets/SiteUrlWidget";
import { updateSetting } from "./settings";
import SetupCheckList from "./setup/components/SetupCheckList";
import SlackSettings from "./slack/containers/SlackSettings";

// This allows plugins to update the settings sections
function updateSectionsWithPlugins(sections) {
  if (PLUGIN_ADMIN_SETTINGS_UPDATES.length > 0) {
    const reduced = PLUGIN_ADMIN_SETTINGS_UPDATES.reduce(
      (sections, update) => update(sections),
      sections,
    );

    // the update functions may change the key ordering inadvertently
    // see: https://github.com/aearly/icepick/issues/48
    // therefore, re-sort the reduced object according to the original key order
    const sortByOrder = (
      [, { order: order1 = Number.MAX_VALUE }],
      [, { order: order2 = Number.MAX_VALUE }],
    ) => order1 - order2;

    return Object.fromEntries(Object.entries(reduced).sort(sortByOrder));
  } else {
    return sections;
  }
}

export const ADMIN_SETTINGS_SECTIONS = {
  setup: {
    name: t`Setup`,
    order: 10,
    settings: [],
    component: SetupCheckList,
    adminOnly: true,
  },
  general: {
    name: t`General`,
    order: 20,
    settings: [
      {
        key: "site-name",
        display_name: t`Site Name`,
        type: "string",
      },
      {
        key: "site-url",
        display_name: t`Site URL`,
        type: "string",
        widget: SiteUrlWidget,
        warningMessage: t`Only change this if you know what you're doing!`,
      },
      {
        key: "custom-homepage",
        display_name: t`Custom Homepage`,
        type: "boolean",
        postUpdateActions: [refreshCurrentUser],
        onChanged: (oldVal, newVal, _settings, handleChangeSetting) => {
          if (!newVal && oldVal) {
            handleChangeSetting("custom-homepage-dashboard", null);
          }
        },
      },
      {
        key: "custom-homepage-dashboard",
        description: null,
        getHidden: ({ "custom-homepage": customHomepage }) => !customHomepage,
        widget: DashboardSelector,
        postUpdateActions: [
          () =>
            updateSetting({
              key: "dismissed-custom-dashboard-toast",
              value: true,
            }),
          refreshCurrentUser,
        ],
        getProps: setting => ({
          value: setting.value,
        }),
        onChanged: (oldVal, newVal) => {
          if (newVal && !oldVal) {
            trackCustomHomepageDashboardEnabled("admin");
          }
        },
      },
      {
        key: "redirect-all-requests-to-https",
        display_name: t`Redirect to HTTPS`,
        type: "boolean",
        getHidden: ({ "site-url": url }) => !/^https:\/\//.test(url),
        widget: HttpsOnlyWidget,
      },
      {
        key: "admin-email",
        display_name: t`Email Address for Help Requests`,
        type: "string",
      },

      {
        key: "anon-tracking-enabled",
        display_name: t`Anonymous Tracking`,
        type: "boolean",
        onChanged: (_oldValue, newValue) => {
          trackTrackingPermissionChanged(newValue);
        },
        onBeforeChanged: (_oldValue, newValue) => {
          trackTrackingPermissionChanged(newValue);
        },
      },
      {
        key: "humanization-strategy",
        display_name: t`Friendly Table and Field Names`,
        type: "select",
        options: [
          {
            value: "simple",
            name: t`Replace underscores and dashes with spaces`,
          },
          { value: "none", name: t`Disabled` },
        ],
        defaultValue: "simple",
      },
      {
        key: "enable-xrays",
        display_name: t`Enable X-ray features`,
        type: "boolean",
      },
    ],
  },
  updates: {
    name: t`Updates`,
    order: 30,
    component: SettingsUpdatesForm,
    settings: [
      {
        key: "check-for-updates",
        display_name: t`Check for updates`,
        type: "boolean",
      },
    ],
    adminOnly: true,
  },
  email: {
    name: t`Email`,
    order: 40,
    component: SettingsEmailForm,
    settings: [
      {
        key: "email-from-name",
        display_name: t`From Name`,
        placeholder: "Metabase",
        type: "string",
        required: false,
      },
      {
        key: "email-from-address",
        display_name: t`From Address`,
        placeholder: "metabase@yourcompany.com",
        type: "string",
        required: true,
        validations: [["email", t`That's not a valid email address`]],
      },
      {
        key: "email-reply-to",
        display_name: t`Reply-To Address`,
        placeholder: "metabase-replies@yourcompany.com",
        type: "string",
        required: false,
        widget: SettingCommaDelimitedInput,
        validations: [["email_list", t`That's not a valid email address`]],
      },
      {
        key: "bcc-enabled?",
        display_name: t`Add Recipients as CC or BCC`,
        description: t`Control the visibility of recipients.`,
        options: [
          { value: true, name: t`BCC - Hide recipients` },
          {
            value: false,
            name: t`CC - Disclose recipients`,
          },
        ],
        defaultValue: true,
        widget: BccToggleWidget,
      },
    ],
  },
  "email/smtp": {
    component: SMTPConnectionForm,
    settings: [
      {
        key: "email-smtp-host",
        display_name: t`SMTP Host`,
        placeholder: "smtp.yourservice.com",
        type: "string",
        required: true,
        autoFocus: true,
      },
      {
        key: "email-smtp-port",
        display_name: t`SMTP Port`,
        placeholder: "587",
        type: "number",
        required: true,
        validations: [["integer", t`That's not a valid port number`]],
      },
      {
        key: "email-smtp-security",
        display_name: t`SMTP Security`,
        description: null,
        type: "radio",
        options: { none: "None", ssl: "SSL", tls: "TLS", starttls: "STARTTLS" },
        defaultValue: "none",
      },
      {
        key: "email-smtp-username",
        display_name: t`SMTP Username`,
        description: null,
        placeholder: "nicetoseeyou",
        type: "string",
      },
      {
        key: "email-smtp-password",
        display_name: t`SMTP Password`,
        description: null,
        placeholder: "Shhh...",
        type: "password",
        getHidden: () => MetabaseSettings.isHosted(),
      },
    ],
  },
  slack: {
    name: "Slack",
    order: 50,
    component: SlackSettings,
    settings: [],
  },
  authentication: {
    name: t`Authentication`,
    order: 60,
    key: "authentication",
    tabs:
      PLUGIN_ADMIN_SETTINGS_AUTH_TABS.length <= 1
        ? undefined
        : PLUGIN_ADMIN_SETTINGS_AUTH_TABS.map(tab => ({
            ...tab,
            isActive: tab.key === "authentication",
          })),
    settings: [], // added by plugins
    adminOnly: true,
  },
  maps: {
    name: t`Maps`,
    order: 70,
    settings: [
      {
        key: "map-tile-server-url",
        display_name: t`Map tile server URL`,
        note: t`Metabase uses OpenStreetMaps by default.`,
        type: "string",
      },
      {
        key: "custom-geojson",
        display_name: t`Custom Maps`,
        description: t`Add your own GeoJSON files to enable different region map visualizations`,
        widget: CustomGeoJSONWidget,
        noHeader: true,
      },
    ],
  },
  localization: {
    name: t`Localization`,
    order: 80,
    settings: [
      {
        display_name: t`Instance language`,
        key: "site-locale",
        type: "select",
        options: _.sortBy(
          MetabaseSettings.get("available-locales") || [],
          ([code, name]) => name,
        ).map(([code, name]) => ({ name, value: code })),
        defaultValue: "en",
        onChanged: (oldLocale, newLocale) => {
          if (oldLocale !== newLocale) {
            window.location.reload();
          }
        },
      },
      {
        key: "report-timezone",
        display_name: t`Report Timezone`,
        type: "select",
        options: [
          { name: t`Database Default`, value: "" },
          ...(MetabaseSettings.get("available-timezones") || []),
        ],
        note: t`Not all databases support timezones, in which case this setting won't take effect.`,
        allowValueCollection: true,
        searchProp: "name",
        defaultValue: "",
      },
      {
        key: "start-of-week",
        display_name: t`First day of the week`,
        type: "select",
        options: [
          { value: "sunday", name: t`Sunday` },
          { value: "monday", name: t`Monday` },
          { value: "tuesday", name: t`Tuesday` },
          { value: "wednesday", name: t`Wednesday` },
          { value: "thursday", name: t`Thursday` },
          { value: "friday", name: t`Friday` },
          { value: "saturday", name: t`Saturday` },
        ],
        defaultValue: "sunday",
      },
      {
        display_name: t`Localization options`,
        description: "",
        key: "custom-formatting",
        widget: FormattingWidget,
      },
    ],
  },
  uploads: {
    name: t`Uploads`,
    order: 85,
    adminOnly: false,
    component: UploadSettings,
    settings: [
      {
        key: "uploads-settings",
      },
    ],
  },

  "public-sharing": {
    name: t`Public Sharing`,
    order: 90,
    settings: [
      {
        key: "enable-public-sharing",
        display_name: t`Enable Public Sharing`,
        description: t`Enable admins to create publicly viewable links (and embeddable iframes) for Questions and Dashboards.`,
        type: "boolean",
      },
      {
        key: "-public-sharing-dashboards",
        display_name: t`Shared Dashboards`,
        widget: PublicLinksDashboardListing,
        getHidden: (_, derivedSettings) =>
          !derivedSettings["enable-public-sharing"],
      },
      {
        key: "-public-sharing-questions",
        display_name: t`Shared Questions`,
        widget: PublicLinksQuestionListing,
        getHidden: (_, derivedSettings) =>
          !derivedSettings["enable-public-sharing"],
      },
      {
        key: "-public-sharing-actions",
        display_name: t`Shared Action Forms`,
        widget: PublicLinksActionListing,
        getHidden: (_, derivedSettings) =>
          !derivedSettings["enable-public-sharing"],
      },
    ],
  },
  "embedding-in-other-applications": {
    key: "enable-embedding",
    name: t`Embedding`,
    order: 100,
    settings: [
      {
        key: "enable-embedding",
        display_name: t`Embedding`,
        description: null,
        widget: EmbeddingSwitchWidget,
      },
      {
        key: "-static-embedding",
        widget: StaticEmbeddingOptionCard,
      },
      {
        key: "-interactive-embedding",
        widget: InteractiveEmbeddingOptionCard,
      },
    ],
  },
  "embedding-in-other-applications/standalone": {
    settings: [
      {
        key: "-breadcrumb",
        widget: () => {
          return (
            <Breadcrumbs
              size="large"
              crumbs={[
                [
                  t`Embedding`,
                  "/admin/settings/embedding-in-other-applications",
                ],
                [t`Static embedding`],
              ]}
            />
          );
        },
      },
      {
        key: "embedding-secret-key",
        display_name: t`Embedding secret key`,
        description: t`Standalone Embed Secret Key used to sign JSON Web Tokens for requests to /api/embed endpoints. This lets you create a secure environment limited to specific users or organizations.`,
        widget: SecretKeyWidget,
        getHidden: (_, derivedSettings) => !derivedSettings["enable-embedding"],
        props: {
          confirmation: {
            header: t`Regenerate embedding key?`,
            dialog: t`This will cause existing embeds to stop working until they are updated with the new key.`,
          },
        },
      },

      {
        key: "-embedded-resources",
        display_name: t`Manage embeds`,

        widget: EmbeddedResources,
        getHidden: (_, derivedSettings) => !derivedSettings["enable-embedding"],
      },
      {
        key: "-redirect-widget",
        widget: () => (
          <RedirectWidget to="/admin/settings/embedding-in-other-applications" />
        ),
        getHidden: (_, derivedSettings) => derivedSettings["enable-embedding"],
      },
    ],
  },
  "embedding-in-other-applications/full-app": {
    settings: [
      {
        key: "-breadcrumbs",
        widget: () => {
          return (
            <Breadcrumbs
              size="large"
              crumbs={[
                [
                  t`Embedding`,
                  "/admin/settings/embedding-in-other-applications",
                ],
                [t`Interactive embedding`],
              ]}
            />
          );
        },
      },
      {
        key: "-redirect-widget",
        widget: () => (
          <RedirectWidget to="/admin/settings/embedding-in-other-applications" />
        ),
        getHidden: (_, derivedSettings) =>
          PLUGIN_EMBEDDING.isEnabled() && derivedSettings["enable-embedding"],
      },
    ],
  },
  license: {
    name: t`License`,
    order: 110,
    component: SettingsLicense,
    settings: [],
  },
  metabot: {
    name: t`Metabot`,
    order: 130,
    getHidden: settings => !settings["is-metabot-enabled"],
    settings: [
      {
        key: "openai-api-key",
        display_name: t`OpenAI API Key`,
        description: null,
        type: "string",
        getHidden: (_, settings) => !settings["is-metabot-enabled"],
      },
      {
        key: "openai-organization",
        display_name: t`OpenAI Organization ID`,
        description: null,
        type: "string",
        getHidden: (_, settings) => !settings["is-metabot-enabled"],
      },
      {
        key: "openai-model",
        display_name: t`OpenAI Model`,
        description: null,
        type: "select",
        getProps: (_, settings) => {
          const models = settings["openai-available-models"] ?? [];

          return {
            options: models.map(model => ({ name: model.id, value: model.id })),
            disabled: !models.length,
          };
        },
        getHidden: (_, settings) => !settings["is-metabot-enabled"],
      },
    ],
  },
  llm: {
    name: t`AI Features`,
    getHidden: () => !PLUGIN_LLM_AUTODESCRIPTION.isEnabled(),
    order: 131,
    settings: [
      {
        key: "ee-ai-features-enabled",
        display_name: t`AI features enabled`,
        note: t`You must supply an API key before AI features can be enabled.`,
        type: "boolean",
      },
      {
        key: "ee-openai-api-key",
        display_name: t`EE OpenAI API Key`,
        description: t`API key used for Enterprise AI features`,
        type: "string",
      },
    ],
  },
  cloud: {
    name: t`Cloud`,
    getHidden: settings => settings["token-features"]?.hosting === true,
    order: 132,
    component: CloudPanel,
    settings: [],
  },
};

export const getSectionsWithPlugins = _.once(() =>
  updateSectionsWithPlugins(ADMIN_SETTINGS_SECTIONS),
);

export const getSettings = createSelector(
  state => state.admin.settings.settings,
  state => state.admin.settings.warnings,
  (settings, warnings) =>
    settings.map(setting =>
      warnings[setting.key]
        ? { ...setting, warning: warnings[setting.key] }
        : setting,
    ),
);

// getSettings selector returns settings for admin setting page and values specified by
// environment variables set to "null". Actual applied setting values are coming from
// /api/session/properties API handler and getDerivedSettingValues returns them.
export const getDerivedSettingValues = state => state.settings?.values ?? {};

export const getSettingValues = createSelector(getSettings, settings => {
  const settingValues = {};
  for (const setting of settings) {
    settingValues[setting.key] = setting.value;
  }
  return settingValues;
});

export const getNewVersionAvailable = createSelector(getSettings, settings => {
  return MetabaseSettings.newVersionAvailable(settings);
});

export const getSections = createSelector(
  getSettings,
  getDerivedSettingValues,
  getUserIsAdmin,
  (settings, derivedSettingValues, isAdmin) => {
    if (!settings || _.isEmpty(settings)) {
      return {};
    }

    const sections = getSectionsWithPlugins();
    const settingsByKey = _.groupBy(settings, "key");
    const sectionsWithAPISettings = {};
    for (const [slug, section] of Object.entries(sections)) {
      const isHidden = section.getHidden?.(derivedSettingValues);

      if (isHidden || (section.adminOnly && !isAdmin)) {
        continue;
      }

      const settings = section.settings.map(function (setting) {
        const apiSetting =
          settingsByKey[setting.key] && settingsByKey[setting.key][0];

        if (apiSetting) {
          const value = setting.showActualValue
            ? derivedSettingValues[setting.key]
            : apiSetting.value;
          return {
            placeholder: apiSetting.default,
            ...apiSetting,
            ...setting,
            value,
          };
        } else {
          return setting;
        }
      });
      sectionsWithAPISettings[slug] = { ...section, settings };
    }
    return sectionsWithAPISettings;
  },
);

export const getActiveSectionName = (state, props) => props.params.splat;

export const getActiveSection = createSelector(
  getActiveSectionName,
  getSections,
  (section = "setup", sections) => {
    if (sections) {
      return sections[section];
    } else {
      return null;
    }
  },
);
