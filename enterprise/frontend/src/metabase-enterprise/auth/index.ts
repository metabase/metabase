import { LOGIN, LOGIN_GOOGLE } from "metabase/auth/actions";
import MetabaseSettings from "metabase/lib/settings";
import {
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
import { SettingsJWTForm } from "./components/SettingsJWTForm";
import { SettingsSAMLForm } from "./components/SettingsSAMLForm";
import { SsoButton } from "./components/SsoButton";

const SSO_PROVIDER = {
  name: "sso",
  Button: SsoButton,
};

if (hasPremiumFeature("sso_saml")) {
  PLUGIN_AUTH_PROVIDERS.SettingsSAMLForm = SettingsSAMLForm;
}

if (hasPremiumFeature("sso_jwt")) {
  PLUGIN_AUTH_PROVIDERS.SettingsJWTForm = SettingsJWTForm;
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
  PLUGIN_IS_PASSWORD_USER.push((user) =>
    Boolean(
      user.sso_source !== "google" &&
        user.sso_source !== "ldap" &&
        MetabaseSettings.isPasswordLoginEnabled(),
    ),
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
