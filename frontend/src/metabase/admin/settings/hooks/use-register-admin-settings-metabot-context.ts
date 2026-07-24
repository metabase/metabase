import { t } from "ttag";

import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { getLocation } from "metabase/selectors/routing";
import * as Urls from "metabase/urls";
import type { MetabotChatContext } from "metabase-types/api";

const ADMIN_SETTINGS_PATH_PREFIX = "/admin/settings/";

export const getAdminSettingsSectionLabels = (): Record<string, string> => ({
  general: t`General`,
  authentication: t`Authentication`,
  "authentication/user-provisioning": t`User provisioning`,
  "authentication/api-keys": t`API keys`,
  "authentication/google": t`Google auth`,
  "authentication/ldap": "LDAP",
  "authentication/saml": "SAML",
  "authentication/jwt": "JWT",
  "authentication/oidc": "OIDC",
  "remote-sync": t`Remote sync`,
  email: t`Email`,
  slack: t`Slack`,
  webhooks: t`Webhooks`,
  updates: t`Updates`,
  localization: t`Localization`,
  "custom-visualizations": t`Custom visualizations`,
  [Urls.DATA_APP_URL_SEGMENT]: t`Data apps`,
  maps: t`Maps`,
  appearance: t`Appearance`,
  whitelabel: t`Appearance`,
  "whitelabel/branding": t`Branding`,
  "whitelabel/conceal-metabase": t`Conceal Metabase`,
  uploads: t`Uploads`,
  "python-runner": t`Python Runner`,
  "public-sharing": t`Public sharing`,
  license: t`License`,
  cloud: t`Cloud`,
});

export const getAdminSettingsSectionLabel = (
  pathname: string,
): string | undefined => {
  if (!pathname.startsWith(ADMIN_SETTINGS_PATH_PREFIX)) {
    return undefined;
  }

  const labels = getAdminSettingsSectionLabels();
  const segments = pathname
    .slice(ADMIN_SETTINGS_PATH_PREFIX.length)
    .split("/")
    .filter((segment) => segment.length > 0);

  for (let length = segments.length; length > 0; length--) {
    const label = labels[segments.slice(0, length).join("/")];
    if (label) {
      return label;
    }
  }

  return undefined;
};

export const getAdminSettingsMetabotContext = (
  pathname: string,
): Partial<MetabotChatContext> => {
  const section = getAdminSettingsSectionLabel(pathname);
  if (!section) {
    return {};
  }

  return {
    user_is_viewing: [{ type: "admin_settings", section, path: pathname }],
  };
};

export const useRegisterAdminSettingsMetabotContext = () => {
  useRegisterMetabotContextProvider(
    async (state) =>
      getAdminSettingsMetabotContext(getLocation(state).pathname),
    [],
  );
};
