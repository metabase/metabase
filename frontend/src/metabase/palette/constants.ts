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

export const METABASE_DOCS_LABELS = {
  get section() {
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- Only shown when showMetabaseLinks is true; links to metabase.com docs.
    return t`Metabase documentation`;
  },
  searchLabel(searchTerm: string) {
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- Only shown when showMetabaseLinks is true; links to metabase.com docs.
    return t`Search Metabase's docs for "${searchTerm}"`;
  },
  get viewLabel() {
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- Only shown when showMetabaseLinks is true; links to metabase.com docs.
    return t`View Metabase documentation`;
  },
};

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
  slack: {
    name: t`Slack`,
  },
  webhooks: {
    name: t`Webhooks`,
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
