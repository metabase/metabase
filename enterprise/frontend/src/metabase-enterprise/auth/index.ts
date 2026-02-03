import { LOGIN, LOGIN_GOOGLE } from "metabase/auth/actions";
import MetabaseSettings from "metabase/lib/settings";
import {
  PLUGIN_AUTH_PROVIDERS,
  PLUGIN_IS_PASSWORD_USER,
  PLUGIN_LDAP_FORM_FIELDS,
  PLUGIN_REDUX_MIDDLEWARES,
} from "metabase/plugins";
import type { AuthProvider } from "metabase/plugins/types";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import type { User } from "metabase-types/api";

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

/**
 * Initialize auth plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  // Always set AuthSettingsPage - this doesn't depend on premium features
  PLUGIN_AUTH_PROVIDERS.AuthSettingsPage = AuthSettingsPage;
  if (hasPremiumFeature("sso_saml")) {
    PLUGIN_AUTH_PROVIDERS.SettingsSAMLForm = SettingsSAMLForm;
  }

  if (hasPremiumFeature("sso_jwt")) {
    PLUGIN_AUTH_PROVIDERS.SettingsJWTForm = SettingsJWTForm;
  }

  // Add provider function that handles SSO and password login
  const enhancedProviderFunction = (providers: AuthProvider[]) => {
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
  };

  PLUGIN_AUTH_PROVIDERS.providers.push(enhancedProviderFunction);

  if (hasPremiumFeature("disable_password_login")) {
    const passwordUserFunction = (user: User) =>
      Boolean(
        user.sso_source !== "google" &&
          user.sso_source !== "ldap" &&
          MetabaseSettings.isPasswordLoginEnabled(),
      );

    PLUGIN_IS_PASSWORD_USER.push(passwordUserFunction);
  }

  if (hasPremiumFeature("sso_ldap")) {
    Object.assign(PLUGIN_LDAP_FORM_FIELDS, {
      LdapGroupMembershipFilter,
      LdapUserProvisioning,
    });
  }

  if (hasPremiumFeature("session_timeout_config")) {
    PLUGIN_REDUX_MIDDLEWARES.push(
      createSessionMiddleware([LOGIN, LOGIN_GOOGLE]),
    );
  }
}
