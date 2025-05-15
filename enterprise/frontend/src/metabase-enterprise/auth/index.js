import { t } from "ttag";

import { LOGIN, LOGIN_GOOGLE } from "metabase/auth/actions";
import MetabaseSettings from "metabase/lib/settings";
import {
  PLUGIN_ADMIN_SETTINGS_UPDATES,
  PLUGIN_AUTH_PROVIDERS,
  PLUGIN_IS_PASSWORD_USER,
  PLUGIN_LDAP_FORM_FIELDS,
  PLUGIN_REDUX_MIDDLEWARES,
} from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { createSessionMiddleware } from "../auth/middleware/session-middleware";

import { AuthSettingsPage } from "./components/AuthSettingsPage";
import {
  LdapGroupMembershipFilter,
  LdapUserProvisioning,
} from "./components/Ldap";
import SettingsJWTForm from "./components/SettingsJWTForm";
import { SettingsSAMLForm } from "./components/SettingsSAMLForm";
import { SsoButton } from "./components/SsoButton";

PLUGIN_ADMIN_SETTINGS_UPDATES.push((sections) => ({
  ...sections,
  "authentication/jwt": {
    component: SettingsJWTForm,
    getHidden: () => !hasPremiumFeature("sso_jwt"),
    settings: [
      {
        key: "jwt-enabled",
        display_name: t`JWT Authentication`,
        type: "boolean",
      },
      {
        key: "jwt-user-provisioning-enabled?",
        display_name: t`User Provisioning`,
        // eslint-disable-next-line no-literal-metabase-strings -- This string only shows for admins.
        description: t`When a user logs in via JWT, create a Metabase account for them automatically if they don't have one.`,
        type: "boolean",
      },
      {
        key: "jwt-identity-provider-uri",
        display_name: t`JWT Identity Provider URI`,
        placeholder: "https://jwt.yourdomain.org",
        type: "string",
        required: false,
        autoFocus: true,
        getHidden: (_, derivedSettings) => !derivedSettings["jwt-enabled"],
      },
      {
        key: "jwt-shared-secret",
        display_name: t`String used by the JWT signing key`,
        type: "text",
        required: true,
        getHidden: (_, derivedSettings) => !derivedSettings["jwt-enabled"],
      },
      {
        key: "jwt-attribute-email",
        display_name: t`Email attribute`,
        type: "string",
      },
      {
        key: "jwt-attribute-firstname",
        display_name: t`First name attribute`,
        type: "string",
      },
      {
        key: "jwt-attribute-lastname",
        display_name: t`Last name attribute`,
        type: "string",
      },
      {
        key: "jwt-group-sync",
        display_name: t`Synchronize group memberships`,
        description: null,
      },
      {
        key: "jwt-group-mappings",
      },
    ],
  },
}));

const SSO_PROVIDER = {
  name: "sso",
  Button: SsoButton,
};

if (hasPremiumFeature("sso_saml")) {
  PLUGIN_AUTH_PROVIDERS.SettingsSAMLForm = SettingsSAMLForm;
}

PLUGIN_AUTH_PROVIDERS.AuthSettingsPage = AuthSettingsPage;

PLUGIN_AUTH_PROVIDERS.providers.push((providers) => {
  if (
    (hasPremiumFeature("sso_jwt") || hasPremiumFeature("sso_saml")) &&
    MetabaseSettings.get("other-sso-enabled?")
  ) {
    providers = [SSO_PROVIDER, ...providers];
  }
  if (
    hasPremiumFeature("disable_password_login") &&
    !MetabaseSettings.isPasswordLoginEnabled() &&
    !MetabaseSettings.isLdapEnabled()
  ) {
    providers = providers.filter((p) => p.name !== "password");
  }
  return providers;
});

if (hasPremiumFeature("disable_password_login")) {
  PLUGIN_IS_PASSWORD_USER.push(
    (user) =>
      user.sso_source !== "google" &&
      user.sso_source !== "ldap" &&
      MetabaseSettings.isPasswordLoginEnabled(),
  );
}

if (hasPremiumFeature("sso_ldap")) {
  Object.assign(PLUGIN_LDAP_FORM_FIELDS, {
    LdapGroupMembershipFilter,
    LdapUserProvisioning,
  });
}

if (hasPremiumFeature("session_timeout_config")) {
  PLUGIN_REDUX_MIDDLEWARES.push(createSessionMiddleware([LOGIN, LOGIN_GOOGLE]));
}
