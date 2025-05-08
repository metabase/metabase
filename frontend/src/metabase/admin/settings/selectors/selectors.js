/* eslint-disable ttag/no-module-declaration -- see metabase#55045 */
import { createSelector } from "@reduxjs/toolkit";
import { t } from "ttag";
import _ from "underscore";

import { SMTPConnectionForm } from "metabase/admin/settings/components/Email/SMTPConnectionForm";
import MetabaseSettings from "metabase/lib/settings";
import {
  PLUGIN_ADMIN_SETTINGS,
  PLUGIN_ADMIN_SETTINGS_AUTH_TABS,
  PLUGIN_ADMIN_SETTINGS_UPDATES,
  PLUGIN_LLM_AUTODESCRIPTION,
} from "metabase/plugins";
import { getDocsUrlForVersion } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";

import { CloudPanel } from "../components/CloudPanel";
import {
  EmbeddingSdkSettings,
  EmbeddingSettings,
  StaticEmbeddingSettings,
} from "../components/EmbeddingSettings";
import SettingsLicense from "../components/SettingsLicense";
import { AppearanceSettingsPage } from "../components/SettingsPages/AppearanceSettingsPage";
import { EmailSettingsPage } from "../components/SettingsPages/EmailSettingsPage";
import { GeneralSettingsPage } from "../components/SettingsPages/GeneralSettingsPage";
import { PublicSharingSettingsPage } from "../components/SettingsPages/PublicSharingSettingsPage";
import { UpdatesSettingsPage } from "../components/SettingsPages/UpdatesSettingsPage";
import { UploadSettingsPage } from "../components/SettingsPages/UploadSettingsPage";
import CustomGeoJSONWidget from "../components/widgets/CustomGeoJSONWidget";
import FormattingWidget from "../components/widgets/FormattingWidget";
import { NotificationSettings } from "../notifications/NotificationSettings";
import SlackSettings from "../slack/containers/SlackSettings";

import {
  getAdminSettingDefinitions,
  getAdminSettingWarnings,
} from "./typed-selectors";

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
  general: {
    order: 20,
    name: t`General`,
    component: GeneralSettingsPage,
    settings: [],
  },
  updates: {
    name: t`Updates`,
    order: 30,
    component: UpdatesSettingsPage,
    settings: [],
    adminOnly: true,
  },
  email: {
    name: t`Email`,
    order: 40,
    component: EmailSettingsPage,
    settings: [],
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
        options: [
          { value: "none", name: "None" },
          { value: "ssl", name: "SSL" },
          { value: "tls", name: "TLS" },
          { value: "starttls", name: "STARTTLS" },
        ],
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
  "notifications/slack": {
    name: "Slack",
    order: 50,
    component: SlackSettings,
    settings: [],
  },
  notifications: {
    name: t`Notification channels`,
    order: 51,
    component: NotificationSettings,
    settings: [],
  },
  authentication: {
    name: t`Authentication`,
    order: 60,
    key: "authentication",
    tabs:
      PLUGIN_ADMIN_SETTINGS_AUTH_TABS.length <= 1
        ? undefined
        : PLUGIN_ADMIN_SETTINGS_AUTH_TABS.map((tab) => ({
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
        description: (
          <>
            <div>
              {t`URL of the map tile server to use for rendering maps. If you're using a custom map tile server, you can set it here.`}
            </div>
            <div>{t`Metabase uses OpenStreetMaps by default.`}</div>
          </>
        ),
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
        description: (
          <>
            <div>{t`Connection timezone to use when executing queries. Defaults to system timezone.`}</div>
            <div>{t`Not all databases support timezones, in which case this setting won't take effect.`}</div>
          </>
        ),
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
    component: UploadSettingsPage,
    settings: [],
  },
  "public-sharing": {
    name: t`Public Sharing`,
    order: 90,
    component: PublicSharingSettingsPage,
    settings: [],
  },
  "embedding-in-other-applications": {
    key: "enable-embedding",
    name: t`Embedding`,
    order: 100,
    component: EmbeddingSettings,
    settings: [],
  },
  "embedding-in-other-applications/standalone": {
    component: StaticEmbeddingSettings,
    settings: [],
  },
  "embedding-in-other-applications/sdk": {
    component: EmbeddingSdkSettings,
    settings: [],
  },
  "embedding-in-other-applications/full-app": {
    // We need to do this because EE plugins would load after this file in unit tests
    component: ({ updateSetting }) => (
      <PLUGIN_ADMIN_SETTINGS.InteractiveEmbeddingSettings
        updateSetting={updateSetting}
      />
    ),
    settings: [],
  },
  license: {
    name: t`License`,
    order: 110,
    component: SettingsLicense,
    settings: [],
  },
  llm: {
    name: t`AI Features`,
    getHidden: (settings) =>
      !PLUGIN_LLM_AUTODESCRIPTION.isEnabled() || settings["airgap-enabled"],
    order: 131,
    settings: [
      {
        key: "ee-ai-features-enabled",
        display_name: t`AI features enabled`,
        description: (
          <>
            <div>{t`Enable AI features.`}</div>
            <div>{t`You must supply an API key before AI features can be enabled.`}</div>
          </>
        ),
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
  appearance: {
    // OSS Version
    name: t`Appearance`,
    getHidden: (settings) => settings["token-features"]?.whitelabel,
    order: 133,
    component: () => <AppearanceSettingsPage />,
    isUpsell: true,
    settings: [],
  },
  whitelabel: {
    // EE Version
    name: t`Appearance`,
    getHidden: (settings) => !settings["token-features"]?.whitelabel,
    order: 134,
    component: () => <AppearanceSettingsPage tab="branding" />,
    settings: [],
  },
  "whitelabel/branding": {
    name: t`Appearance`,
    component: () => <AppearanceSettingsPage tab="branding" />,
    settings: [],
  },
  "whitelabel/conceal-metabase": {
    name: t`Appearance`,
    component: () => <AppearanceSettingsPage tab="conceal-metabase" />,
    settings: [],
  },
  cloud: {
    name: t`Cloud`,
    getHidden: (settings) =>
      settings["token-features"]?.hosting === true ||
      settings["airgap-enabled"],
    order: 140,
    component: CloudPanel,
    settings: [],
    isUpsell: true,
  },
};

export const getSectionsWithPlugins = _.once(() =>
  updateSectionsWithPlugins(ADMIN_SETTINGS_SECTIONS),
);

export const getSettings = createSelector(
  getAdminSettingDefinitions,
  getAdminSettingWarnings,
  (settings, warnings) =>
    settings.map((setting) =>
      warnings[setting.key]
        ? { ...setting, warning: warnings[setting.key] }
        : setting,
    ),
);

// getSettings selector returns settings for admin setting page and values specified by
// environment variables set to "null". Actual applied setting values are coming from
// /api/session/properties API handler and getDerivedSettingValues returns them.
export const getDerivedSettingValues = (state) => state.settings?.values ?? {};

export const getSettingValues = createSelector(getSettings, (settings) => {
  const settingValues = {};
  for (const setting of settings) {
    settingValues[setting.key] = setting.value;
  }
  return settingValues;
});

export const getCurrentVersion = createSelector(
  getDerivedSettingValues,
  (settings) => {
    return settings.version?.tag;
  },
);

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
          settingsByKey[setting.key] && settingsByKey[setting.key][0]; // unnecessary array, these all have 1 element

        if (apiSetting) {
          const value = setting.showActualValue // showActualValue is never used
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

export function getDocsUrl(page, anchor) {
  const version = MetabaseSettings.get("version");
  return getDocsUrlForVersion(version, page, anchor);
}
