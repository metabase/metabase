/* eslint-disable ttag/no-module-declaration -- see metabase#55045 */
import { createSelector } from "@reduxjs/toolkit";
import { t } from "ttag";
import _ from "underscore";

import MetabaseSettings from "metabase/lib/settings";
import { getDocsUrlForVersion } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";

import { getAdminSettingDefinitions } from "./typed-selectors";

export const ADMIN_SETTINGS_SECTIONS = {
  general: {
    order: 20,
    name: t`General`,
    settings: [],
  },
  updates: {
    name: t`Updates`,
    order: 30,
    getHidden: (settings) => settings["token-features"]?.hosting,
    settings: [],
    adminOnly: true,
  },
  email: {
    name: t`Email`,
    order: 40,
    settings: [],
  },
  "email/smtp": {
    settings: [],
  },
  "notifications/slack": {
    name: "Slack",
    order: 50,
    settings: [],
  },
  notifications: {
    name: t`Notification channels`,
    order: 51,
    settings: [],
  },
  authentication: {
    name: t`Authentication`,
    order: 60,
    settings: [],
    adminOnly: true,
  },
  "authentication/user-provisioning": {
    name: t`Authentication`,
    order: 61,
    settings: [],
    adminOnly: true,
  },
  "authentication/api-keys": {
    name: t`Authentication`,
    order: 62,
    settings: [],
    adminOnly: true,
  },
  "authentication/google": {
    order: 63,
    settings: [],
  },
  "authentication/ldap": {
    order: 64,
    settings: [],
  },
  "authentication/saml": {
    order: 65,
    settings: [],
  },
  "authentication/jwt": {
    order: 66,
    settings: [],
  },
  maps: {
    name: t`Maps`,
    order: 70,
    settings: [],
  },
  localization: {
    name: t`Localization`,
    order: 80,
    settings: [],
  },
  uploads: {
    name: t`Uploads`,
    order: 85,
    adminOnly: false,
    settings: [],
  },
  "public-sharing": {
    name: t`Public Sharing`,
    order: 90,
    settings: [],
  },
  "embedding-in-other-applications": {
    key: "enable-embedding",
    name: t`Embedding`,
    order: 100,
    settings: [],
  },
  "embedding-in-other-applications/standalone": {
    settings: [],
  },
  "embedding-in-other-applications/sdk": {
    settings: [],
  },
  "embedding-in-other-applications/full-app": {
    settings: [],
  },
  license: {
    name: t`License`,
    order: 110,
    settings: [],
  },
  appearance: {
    // OSS Version
    name: t`Appearance`,
    getHidden: (settings) => settings["token-features"]?.whitelabel,
    order: 133,
    isUpsell: true,
    settings: [],
  },
  whitelabel: {
    // EE Version
    name: t`Appearance`,
    getHidden: (settings) => !settings["token-features"]?.whitelabel,
    order: 134,
    settings: [],
  },
  "whitelabel/branding": {
    name: t`Appearance`,
    settings: [],
  },
  "whitelabel/conceal-metabase": {
    name: t`Appearance`,
    settings: [],
  },
  cloud: {
    name: t`Cloud`,
    getHidden: (settings) => settings["airgap-enabled"],
    order: 140,
    settings: [],
    isUpsell: true,
  },
};

export const getSettings = getAdminSettingDefinitions;

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

    const shouldHideSection = (section) => {
      if (section.adminOnly && !isAdmin) {
        return true;
      }

      return !!section.getHidden?.(derivedSettingValues);
    };

    const visibleSections = _.omit(ADMIN_SETTINGS_SECTIONS, shouldHideSection);

    return visibleSections;
  },
);

export const getActiveSectionName = (state, props) => {
  return (
    props.location.pathname.match(/\/admin\/settings\/(.+)/)?.[1] ?? "general"
  );
};

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
