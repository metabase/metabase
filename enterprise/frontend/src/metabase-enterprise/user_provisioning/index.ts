import { t } from "ttag";

import {
  PLUGIN_ADMIN_SETTINGS_AUTH_TABS,
  PLUGIN_ADMIN_SETTINGS_UPDATES,
} from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { UserProvisioning } from "./components/UserProvisioning";

if (hasPremiumFeature("scim")) {
  PLUGIN_ADMIN_SETTINGS_AUTH_TABS.push({
    name: t`User Provisioning`,
    key: "user-provisioning",
    to: "/admin/settings/authentication/user-provisioning",
  });

  // move api keys to its own tab when scim is enabled
  PLUGIN_ADMIN_SETTINGS_AUTH_TABS.push({
    name: t`API Keys`,
    key: "api-keys",
    to: "/admin/settings/authentication/api-keys",
  });

  PLUGIN_ADMIN_SETTINGS_UPDATES.push(sections => ({
    ...sections,
    authentication: {
      ...sections.authentication,
      // remove api keys from the authentication tab's content when scim is enabled
      settings: sections.authentication.settings.filter(
        (setting: { key: string }) => setting.key !== "api-keys",
      ),
    },
    "authentication/user-provisioning": {
      settings: [
        {
          key: "scim-enabled",
          display_name: t`User Provisioning via SCIM`,
          type: "boolean",
        },
        {
          key: "scim-base-url",
          display_name: t`SCIM endpoint URL`,
          type: "string",
        },
        {
          key: "send-new-sso-user-admin-email?",
          display_name: t`Notify admins of new SSO users`,
          description: t`When enabled, administrators will receive an email the first time a user uses Single Sign-On.`,
          type: "boolean",
        },
      ],
      component: UserProvisioning,
    },
  }));
}
