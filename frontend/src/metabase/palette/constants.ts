import { t } from "ttag";

import type { Settings } from "metabase-types/api";

export const GROUP_LABELS = {
  get global() {
    return t`General`;
  },
  get dashboard() {
    return t`Dashboards`;
  },
  get question() {
    return t`Questions`;
  },
  get collection() {
    return t`Collections`;
  },
  get admin() {
    return t`Admin`;
  },
};

export const ELLIPSIS = "...";

type AdminSettingsSections = Record<
  string,
  {
    name: string;
    hidden?: boolean;
    adminOnly?: boolean;
  }
>;

export const getAdminSettingsSections = (
  settings: Settings,
): AdminSettingsSections => ({
  general: {
    name: t`General`,
  },
  updates: {
    name: t`Updates`,
    hidden: settings["token-features"]?.hosting,
    adminOnly: true,
  },
  email: {
    name: t`Email`,
  },
  notifications: {
    name: t`Notification channels`,
  },
  authentication: {
    name: t`Authentication`,
    adminOnly: true,
  },
  "authentication/user-provisioning": {
    name: t`User provisioning`,
    hidden: !settings["token-features"].scim,
    adminOnly: true,
  },
  "authentication/api-keys": {
    name: t`Api keys`,
    adminOnly: true,
  },
  maps: {
    name: t`Maps`,
  },
  localization: {
    name: t`Localization`,
  },
  uploads: {
    name: t`Uploads`,
  },
  "public-sharing": {
    name: t`Public Sharing`,
  },
  license: {
    name: t`License`,
  },
  "whitelabel/branding": {
    name: t`Branding`,
    hidden: !settings["token-features"].whitelabel,
  },
  "whitelabel/conceal-metabase": {
    name: t`Conceal metabase`,
    hidden: !settings["token-features"].whitelabel,
  },
  cloud: {
    name: t`Cloud`,
    hidden: settings["airgap-enabled"],
  },
});
