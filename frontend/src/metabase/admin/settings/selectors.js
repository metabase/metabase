import _ from "underscore";
import { createSelector } from "@reduxjs/toolkit";
import { t, jt } from "ttag";
import ExternalLink from "metabase/core/components/ExternalLink";

import MetabaseSettings from "metabase/lib/settings";
import { PersistedModelsApi, UtilApi } from "metabase/services";
import {
  PLUGIN_ADMIN_SETTINGS_UPDATES,
  PLUGIN_EMBEDDING,
} from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import { DashboardSelector } from "metabase/components/DashboardSelector";
import { refreshCurrentUser } from "metabase/redux/user";

import { isPersonalCollectionOrChild } from "metabase/collections/utils";

import { updateSetting } from "./settings";

import SettingCommaDelimitedInput from "./components/widgets/SettingCommaDelimitedInput";
import CustomGeoJSONWidget from "./components/widgets/CustomGeoJSONWidget";
import { UploadSettings } from "./components/UploadSettings";
import SettingsLicense from "./components/SettingsLicense";
import SiteUrlWidget from "./components/widgets/SiteUrlWidget";
import HttpsOnlyWidget from "./components/widgets/HttpsOnlyWidget";
import { EmbeddingCustomizationWidget } from "./components/widgets/EmbeddingCustomizationWidget";
import {
  PublicLinksDashboardListing,
  PublicLinksQuestionListing,
  PublicLinksActionListing,
  EmbeddedQuestionListing,
  EmbeddedDashboardListing,
} from "./components/widgets/PublicLinksListing";
import SecretKeyWidget from "./components/widgets/SecretKeyWidget";
import EmbeddingLegalese from "./components/widgets/EmbeddingLegalese";
import FormattingWidget from "./components/widgets/FormattingWidget";
import { FullAppEmbeddingLinkWidget } from "./components/widgets/FullAppEmbeddingLinkWidget";
import ModelCachingScheduleWidget from "./components/widgets/ModelCachingScheduleWidget";
import SectionDivider from "./components/widgets/SectionDivider";

import SettingsUpdatesForm from "./components/SettingsUpdatesForm/SettingsUpdatesForm";
import SettingsEmailForm from "./components/SettingsEmailForm";
import SetupCheckList from "./setup/components/SetupCheckList";
import SlackSettings from "./slack/containers/SlackSettings";
import {
  trackTrackingPermissionChanged,
  trackCustomHomepageDashboardEnabled,
} from "./analytics";

import EmbeddingOption from "./components/widgets/EmbeddingOption";
import RedirectWidget from "./components/widgets/RedirectWidget";

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
              key: "dismissed_custom_dashboard_toast",
              value: true,
            }),
          refreshCurrentUser,
        ],
        getProps: setting => ({
          value: setting.value,
          collectionFilter: (collection, index, allCollections) =>
            !isPersonalCollectionOrChild(collection, allCollections),
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
        onChanged: (oldValue, newValue) => {
          trackTrackingPermissionChanged(newValue);
        },
        onBeforeChanged: (oldValue, newValue) => {
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
          ...MetabaseSettings.get("available-timezones"),
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
        key: "uploads-enabled",
        display_name: t`Data Uploads`,
        description: t`Enable admins to upload data to new database tables from CSV files.`,
        type: "boolean",
      },
      {
        key: "uploads-database-id",
        getHidden: settings => !settings["uploads-enabled"],
        display_name: t`Database`,
        description: t`Identify a database where upload tables will be created.`,
        placeholder: t`Select a database`,
      },
      {
        key: "uploads-schema-name",
        display_name: t`Schema name`,
        description: t`Identify a database schema where data upload tables will be created.`,
        type: "string",
        placeholder: "uploads",
      },
      {
        key: "uploads-table-prefix",
        display_name: t`Table prefix`,
        description: t`Identify a table prefix for tables created by data uploads.`,
        placeholder: "uploaded_",
        type: "string",
        required: false,
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
        getHidden: settings => !settings["enable-public-sharing"],
      },
      {
        key: "-public-sharing-questions",
        display_name: t`Shared Questions`,
        widget: PublicLinksQuestionListing,
        getHidden: settings => !settings["enable-public-sharing"],
      },
      {
        key: "-public-sharing-actions",
        display_name: t`Shared Action Forms`,
        widget: PublicLinksActionListing,
        getHidden: settings => !settings["enable-public-sharing"],
      },
    ],
  },
  "embedding-in-other-applications": {
    name: t`Embedding`,
    order: 100,
    settings: [
      {
        key: "enable-embedding",
        description: null,
        widget: EmbeddingLegalese,
        getHidden: (_, derivedSettings) => derivedSettings["enable-embedding"],
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
        display_name: t`Embedding`,
        description: jt`Allow questions, dashboards, and more to be embedded. ${(
          <ExternalLink
            key="learn-embedding-link"
            href={MetabaseSettings.learnUrl(
              "embedding/embedding-charts-and-dashboards.html",
            )}
          >
            {t`Learn more.`}
          </ExternalLink>
        )}`,
        type: "boolean",
        showActualValue: true,
        getProps: setting => {
          if (setting.is_env_setting) {
            return {
              tooltip: setting.placeholder,
              disabled: true,
            };
          }
          return null;
        },
        getHidden: (_, derivedSettings) => !derivedSettings["enable-embedding"],
      },
      {
        key: "-static-embedding",
        widget: EmbeddingOption,
        getHidden: (_, derivedSettings) => !derivedSettings["enable-embedding"],
        embedName: t`Static embedding`,
        embedDescription: t`Embed dashboards, charts, and questions on your app or website with basic filters for insights with limited discovery.`,
        embedType: "standalone",
      },
      {
        key: "-interactive-embedding",
        widget: EmbeddingOption,
        getHidden: (_, derivedSettings) => !derivedSettings["enable-embedding"],
        embedName: t`Interactive embedding`,
        embedDescription: t`With this Pro/Enterprise feature, you can let your customers query, visualize, and drill-down on their data with the full functionality of Metabase in your app or website, complete with your branding. Set permissions with SSO, down to the row- or column-level, so people only see what they need to.`,
        embedType: "full-app",
      },
    ],
  },
  "embedding-in-other-applications/standalone": {
    settings: [
      {
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
        key: "-embedded-dashboards",
        display_name: t`Embedded Dashboards`,
        widget: EmbeddedDashboardListing,
        getHidden: (_, derivedSettings) => !derivedSettings["enable-embedding"],
      },
      {
        key: "-embedded-questions",
        display_name: t`Embedded Questions`,
        widget: EmbeddedQuestionListing,
        getHidden: (_, derivedSettings) => !derivedSettings["enable-embedding"],
      },
      {
        widget: EmbeddingCustomizationWidget,
        getHidden: (_, derivedSettings) =>
          !derivedSettings["enable-embedding"] || PLUGIN_EMBEDDING.isEnabled(),
      },
      {
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
        widget: FullAppEmbeddingLinkWidget,
        getHidden: (_, derivedSettings) =>
          !derivedSettings["enable-embedding"] || PLUGIN_EMBEDDING.isEnabled(),
      },
      {
        widget: () => (
          <RedirectWidget to="/admin/settings/embedding-in-other-applications" />
        ),
        getHidden: (_, derivedSettings) => derivedSettings["enable-embedding"],
      },
    ],
  },
  license: {
    name: t`License`,
    order: 110,
    component: SettingsLicense,
    settings: [],
  },
  caching: {
    name: t`Caching`,
    order: 120,
    settings: [
      {
        key: "enable-query-caching",
        display_name: t`Saved questions`,
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
      {
        widget: SectionDivider,
      },
      {
        key: "persisted-models-enabled",
        display_name: t`Models`,
        description: jt`Enabling cache will create tables for your models in a dedicated schema and Metabase will refresh them on a schedule. Questions based on your models will query these tables. ${(
          <ExternalLink
            key="model-caching-link"
            href={MetabaseSettings.docsUrl("data-modeling/models")}
          >{t`Learn more`}</ExternalLink>
        )}.`,
        type: "boolean",
        disableDefaultUpdate: true,
        onChanged: async (wasEnabled, isEnabled) => {
          if (isEnabled) {
            await PersistedModelsApi.enablePersistence();
          } else {
            await PersistedModelsApi.disablePersistence();
          }
        },
      },
      {
        key: "persisted-model-refresh-cron-schedule",
        noHeader: true,
        type: "select",
        options: [
          {
            value: "0 0 0/1 * * ? *",
            name: t`Hour`,
          },
          {
            value: "0 0 0/2 * * ? *",
            name: t`2 hours`,
          },
          {
            value: "0 0 0/3 * * ? *",
            name: t`3 hours`,
          },
          {
            value: "0 0 0/6 * * ? *",
            name: t`6 hours`,
          },
          {
            value: "0 0 0/12 * * ? *",
            name: t`12 hours`,
          },
          {
            value: "0 0 0 ? * * *",
            name: t`24 hours`,
          },
          {
            value: "custom",
            name: t`Custom…`,
          },
        ],
        widget: ModelCachingScheduleWidget,
        disableDefaultUpdate: true,
        getHidden: settings => !settings["persisted-models-enabled"],
        onChanged: (previousValue, value) =>
          PersistedModelsApi.setRefreshSchedule({ cron: value }),
      },
    ],
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
};

const getSectionsWithPlugins = _.once(() =>
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
