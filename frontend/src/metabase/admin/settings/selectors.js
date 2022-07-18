/* eslint-disable react/display-name */
import React from "react";
import _ from "underscore";
import { createSelector } from "reselect";
import { t, jt } from "ttag";
import ExternalLink from "metabase/core/components/ExternalLink";
import SettingCommaDelimitedInput from "./components/widgets/SettingCommaDelimitedInput";
import MetabaseSettings from "metabase/lib/settings";
import CustomGeoJSONWidget from "./components/widgets/CustomGeoJSONWidget";
import SettingsLicense from "./components/SettingsLicense";
import SiteUrlWidget from "./components/widgets/SiteUrlWidget";
import HttpsOnlyWidget from "./components/widgets/HttpsOnlyWidget";
import { EmbeddingCustomizationInfo } from "./components/widgets/EmbeddingCustomizationInfo";
import {
  PublicLinksDashboardListing,
  PublicLinksQuestionListing,
  EmbeddedQuestionListing,
  EmbeddedDashboardListing,
} from "./components/widgets/PublicLinksListing";
import SecretKeyWidget from "./components/widgets/SecretKeyWidget";
import EmbeddingLegalese from "./components/widgets/EmbeddingLegalese";
import FormattingWidget from "./components/widgets/FormattingWidget";
import { PremiumEmbeddingLinkWidget } from "./components/widgets/PremiumEmbeddingLinkWidget";
import ModelCachingScheduleWidget from "./components/widgets/ModelCachingScheduleWidget";
import SectionDivider from "./components/widgets/SectionDivider";
import SettingsUpdatesForm from "./components/SettingsUpdatesForm/SettingsUpdatesForm";
import SettingsEmailForm from "./components/SettingsEmailForm";
import SettingsSetupList from "./components/SettingsSetupList";
import SlackSettings from "./slack/containers/SlackSettings";
import { trackTrackingPermissionChanged } from "./analytics";

import { PersistedModelsApi, UtilApi } from "metabase/services";
import { PLUGIN_ADMIN_SETTINGS_UPDATES } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import Breadcrumbs from "metabase/components/Breadcrumbs";
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

const SECTIONS = updateSectionsWithPlugins({
  setup: {
    name: t`Setup`,
    order: 1,
    settings: [],
    component: SettingsSetupList,
    adminOnly: true,
  },
  general: {
    name: t`General`,
    order: 2,
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
    order: 3,
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
    order: 4,
    component: SettingsEmailForm,
    settings: [
      {
        key: "email-smtp-host",
        display_name: t`SMTP Host`,
        placeholder: "smtp.yourservice.com",
        type: "string",
        required: true,
        autoFocus: true,
        getHidden: () => MetabaseSettings.isHosted(),
      },
      {
        key: "email-smtp-port",
        display_name: t`SMTP Port`,
        placeholder: "587",
        type: "number",
        required: true,
        validations: [["integer", t`That's not a valid port number`]],
        getHidden: () => MetabaseSettings.isHosted(),
      },
      {
        key: "email-smtp-security",
        display_name: t`SMTP Security`,
        description: null,
        type: "radio",
        options: { none: "None", ssl: "SSL", tls: "TLS", starttls: "STARTTLS" },
        defaultValue: "none",
        getHidden: () => MetabaseSettings.isHosted(),
      },
      {
        key: "email-smtp-username",
        display_name: t`SMTP Username`,
        description: null,
        placeholder: "nicetoseeyou",
        type: "string",
        getHidden: () => MetabaseSettings.isHosted(),
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
    order: 5,
    component: SlackSettings,
    settings: [],
  },
  authentication: {
    name: t`Authentication`,
    order: 6,
    settings: [], // added by plugins
  },
  maps: {
    name: t`Maps`,
    order: 7,
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
    order: 8,
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
  "public-sharing": {
    name: t`Public Sharing`,
    order: 9,
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
    ],
  },
  "embedding-in-other-applications": {
    name: t`Embedding`,
    order: 10,
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
            href="https://www.metabase.com/learn/embedding/embedding-charts-and-dashboards.html"
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
        widget: EmbeddingOption,
        getHidden: (_, derivedSettings) => !derivedSettings["enable-embedding"],
        embedName: t`Standalone embeds`,
        embedDescription: t`Securely embed individual questions and dashboards within other applications.`,
        embedType: "standalone",
      },
      {
        widget: EmbeddingOption,
        getHidden: (_, derivedSettings) => !derivedSettings["enable-embedding"],
        embedName: t`Full-app embedding`,
        embedDescription: t`With this Pro/Enterprise feature you can embed the full Metabase app. Enable your users to drill-through to charts, browse collections, and use the graphical query builder.`,
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
                [t`Standalone embeds`],
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
        widget: EmbeddingCustomizationInfo,
        getHidden: (_, derivedSettings) =>
          !derivedSettings["enable-embedding"] ||
          MetabaseSettings.isEnterprise(),
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
                [t`Full-app embedding`],
              ]}
            />
          );
        },
      },
      {
        widget: PremiumEmbeddingLinkWidget,
        getHidden: (_, derivedSettings) =>
          !derivedSettings["enable-embedding"] ||
          MetabaseSettings.isEnterprise(),
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
    order: 11,
    component: SettingsLicense,
    settings: [],
  },
  caching: {
    name: t`Caching`,
    order: 12,
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
            href={MetabaseSettings.docsUrl("users-guide/models")}
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

    const settingsByKey = _.groupBy(settings, "key");
    const sectionsWithAPISettings = {};
    for (const [slug, section] of Object.entries(SECTIONS)) {
      if (section.adminOnly && !isAdmin) {
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
