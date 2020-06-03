import _ from "underscore";
import { createSelector } from "reselect";
import MetabaseSettings from "metabase/lib/settings";
import { t } from "ttag";
import CustomGeoJSONWidget from "./components/widgets/CustomGeoJSONWidget";
import SiteUrlWidget from "./components/widgets/SiteUrlWidget";
import HttpsOnlyWidget from "./components/widgets/HttpsOnlyWidget";
import {
  PublicLinksDashboardListing,
  PublicLinksQuestionListing,
  EmbeddedQuestionListing,
  EmbeddedDashboardListing,
} from "./components/widgets/PublicLinksListing";
import SecretKeyWidget from "./components/widgets/SecretKeyWidget";
import EmbeddingLegalese from "./components/widgets/EmbeddingLegalese";
import EmbeddingLevel from "./components/widgets/EmbeddingLevel";
import FormattingWidget from "./components/widgets/FormattingWidget";

import SettingsUpdatesForm from "./components/SettingsUpdatesForm";
import SettingsEmailForm from "./components/SettingsEmailForm";
import SettingsSetupList from "./components/SettingsSetupList";
import SettingsSlackForm from "./components/SettingsSlackForm";

import { UtilApi } from "metabase/services";
import { PLUGIN_ADMIN_SETTINGS_UPDATES } from "metabase/plugins";

// This allows plugins to update the settings sections
function updateSectionsWithPlugins(sections) {
  return PLUGIN_ADMIN_SETTINGS_UPDATES.reduce(
    (sections, update) => update(sections),
    sections,
  );
}

const SECTIONS = updateSectionsWithPlugins({
  setup: {
    name: t`Setup`,
    settings: [],
    component: SettingsSetupList,
  },
  general: {
    name: t`General`,
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
        key: "report-timezone",
        display_name: t`Report Timezone`,
        type: "select",
        options: [
          { name: t`Database Default`, value: "" },
          ...MetabaseSettings.get("available-timezones"),
        ],
        note: t`Not all databases support timezones, in which case this setting won't take effect.`,
        allowValueCollection: true,
      },
      {
        key: "anon-tracking-enabled",
        display_name: t`Anonymous Tracking`,
        type: "boolean",
      },
      {
        key: "humanization-strategy",
        display_name: t`Friendly Table and Field Names`,
        type: "select",
        options: [
          { value: "advanced", name: t`Enabled` },
          {
            value: "simple",
            name: t`Only replace underscores and dashes with spaces`,
          },
          { value: "none", name: t`Disabled` },
        ],
        defaultValue: "advanced",
      },
      {
        key: "enable-nested-queries",
        display_name: t`Enable Nested Queries`,
        type: "boolean",
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
    component: SettingsUpdatesForm,
    settings: [
      {
        key: "check-for-updates",
        display_name: t`Check for updates`,
        type: "boolean",
      },
    ],
  },
  email: {
    name: t`Email`,
    component: SettingsEmailForm,
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
        placeholder: "youlooknicetoday",
        type: "string",
      },
      {
        key: "email-smtp-password",
        display_name: t`SMTP Password`,
        description: null,
        placeholder: "Shhh...",
        type: "password",
      },
      {
        key: "email-from-address",
        display_name: t`From Address`,
        placeholder: "metabase@yourcompany.com",
        type: "string",
        required: true,
        validations: [["email", t`That's not a valid email address`]],
      },
    ],
  },
  slack: {
    name: "Slack",
    component: SettingsSlackForm,
    settings: [
      {
        key: "slack-token",
        display_name: t`Slack API Token`,
        description: "",
        placeholder: t`Enter the token you received from Slack`,
        type: "string",
        required: false,
        autoFocus: true,
      },
      {
        key: "metabot-enabled",
        display_name: "MetaBot",
        type: "boolean",
        // TODO: why do we have "defaultValue" here in addition to the "default" specified by the backend?
        defaultValue: false,
        required: true,
        autoFocus: false,
      },
    ],
  },
  authentication: {
    name: t`Authentication`,
    settings: [], // added by plugins
  },
  maps: {
    name: t`Maps`,
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
        display_name: t`Localization options`,
        description: "",
        key: "custom-formatting",
        widget: FormattingWidget,
      },
    ],
  },
  public_sharing: {
    name: t`Public Sharing`,
    settings: [
      {
        key: "enable-public-sharing",
        display_name: t`Enable Public Sharing`,
        type: "boolean",
      },
      {
        key: "-public-sharing-dashboards",
        display_name: t`Shared Dashboards`,
        widget: PublicLinksDashboardListing,
        getHidden: settings => !settings["enable-public-sharing"],
      },
      {
        key: "-public-sharing-questions",
        display_name: t`Shared Questions`,
        widget: PublicLinksQuestionListing,
        getHidden: settings => !settings["enable-public-sharing"],
      },
    ],
  },
  embedding_in_other_applications: {
    name: t`Embedding in other Applications`,
    settings: [
      {
        key: "enable-embedding",
        description: null,
        widget: EmbeddingLegalese,
        getHidden: settings => settings["enable-embedding"],
        onChanged: async (
          oldValue,
          newValue,
          settingsValues,
          onChangeSetting,
        ) => {
          // Generate a secret key if none already exists
          if (
            !oldValue &&
            newValue &&
            !settingsValues["embedding-secret-key"]
          ) {
            const result = await UtilApi.random_token();
            await onChangeSetting("embedding-secret-key", result.token);
          }
        },
      },
      {
        key: "enable-embedding",
        display_name: t`Enable Embedding Metabase in other Applications`,
        type: "boolean",
        getHidden: settings => !settings["enable-embedding"],
      },
      {
        widget: EmbeddingLevel,
        getHidden: settings => !settings["enable-embedding"],
      },
      {
        key: "embedding-secret-key",
        display_name: t`Embedding secret key`,
        widget: SecretKeyWidget,
        getHidden: settings => !settings["enable-embedding"],
      },
      {
        key: "-embedded-dashboards",
        display_name: t`Embedded Dashboards`,
        widget: EmbeddedDashboardListing,
        getHidden: settings => !settings["enable-embedding"],
      },
      {
        key: "-embedded-questions",
        display_name: t`Embedded Questions`,
        widget: EmbeddedQuestionListing,
        getHidden: settings => !settings["enable-embedding"],
      },
    ],
  },
  caching: {
    name: t`Caching`,
    settings: [
      {
        key: "enable-query-caching",
        display_name: t`Enable Caching`,
        type: "boolean",
      },
      {
        key: "query-caching-min-ttl",
        display_name: t`Minimum Query Duration`,
        type: "number",
        getHidden: settings => !settings["enable-query-caching"],
        allowValueCollection: true,
      },
      {
        key: "query-caching-ttl-ratio",
        display_name: t`Cache Time-To-Live (TTL) multiplier`,
        type: "number",
        getHidden: settings => !settings["enable-query-caching"],
        allowValueCollection: true,
      },
      {
        key: "query-caching-max-kb",
        display_name: t`Max Cache Entry Size`,
        type: "number",
        getHidden: settings => !settings["enable-query-caching"],
        allowValueCollection: true,
      },
    ],
  },
});

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

export const getSettingValues = createSelector(
  getSettings,
  settings => {
    const settingValues = {};
    for (const setting of settings) {
      settingValues[setting.key] = setting.value;
    }
    return settingValues;
  },
);

export const getNewVersionAvailable = createSelector(
  getSettings,
  settings => {
    return MetabaseSettings.newVersionAvailable(settings);
  },
);

export const getSections = createSelector(
  getSettings,
  settings => {
    if (!settings || _.isEmpty(settings)) {
      return [];
    }

    const settingsByKey = _.groupBy(settings, "key");
    const sectionsWithAPISettings = {};
    for (const [slug, section] of Object.entries(SECTIONS)) {
      const settings = section.settings.map(function(setting) {
        const apiSetting =
          settingsByKey[setting.key] && settingsByKey[setting.key][0];
        if (apiSetting) {
          return {
            placeholder: apiSetting.default,
            ...apiSetting,
            ...setting,
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
