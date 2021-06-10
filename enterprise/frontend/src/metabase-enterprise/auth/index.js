import React from "react";
import ExternalLink from "metabase/components/ExternalLink";
import { t, jt } from "ttag";
import { updateIn } from "icepick";

import { hasPremiumFeature } from "metabase-enterprise/settings";
import MetabaseSettings from "metabase/lib/settings";
import {
  PLUGIN_AUTH_PROVIDERS,
  PLUGIN_SHOW_CHANGE_PASSWORD_CONDITIONS,
  PLUGIN_ADMIN_SETTINGS_UPDATES,
} from "metabase/plugins";
import { UtilApi } from "metabase/services";

import AuthenticationOption from "metabase/admin/settings/components/widgets/AuthenticationOption";
import GroupMappingsWidget from "metabase/admin/settings/components/widgets/GroupMappingsWidget";
import SecretKeyWidget from "metabase/admin/settings/components/widgets/SecretKeyWidget";

import SettingsGoogleForm from "metabase/admin/settings/components/SettingsGoogleForm";
import SettingsSAMLForm from "./components/SettingsSAMLForm";
import SettingsJWTForm from "./components/SettingsJWTForm";

import SSOButton from "./components/SSOButton";

PLUGIN_ADMIN_SETTINGS_UPDATES.push(sections =>
  updateIn(sections, ["authentication", "settings"], settings => [
    ...settings,
    {
      authName: t`SAML`,
      authDescription: t`Allows users to login via a SAML Identity Provider.`,
      authType: "saml",
      authEnabled: settings => settings["saml-enabled"],
      widget: AuthenticationOption,
      getHidden: () => !hasPremiumFeature("sso"),
    },
    {
      authName: t`JWT`,
      authDescription: t`Allows users to login via a JWT Identity Provider.`,
      authType: "jwt",
      authEnabled: settings => settings["jwt-enabled"],
      widget: AuthenticationOption,
      getHidden: () => !hasPremiumFeature("sso"),
    },
    {
      key: "enable-password-login",
      display_name: t`Enable Password Authentication`,
      description: t`When enabled, users can additionally log in with email and password.`,
      type: "boolean",
      getHidden: settings =>
        !settings["google-auth-client-id"] &&
        !settings["ldap-enabled"] &&
        !settings["saml-enabled"] &&
        !settings["jwt-enabled"],
    },
    {
      key: "send-new-sso-user-admin-email?",
      display_name: t`Notify admins of new SSO users`,
      description: t`When enabled, administrators will receive an email the first time a user uses Single Sign-On.`,
      type: "boolean",
      getHidden: settings =>
        !settings["google-auth-client-id"] &&
        !settings["ldap-enabled"] &&
        !settings["saml-enabled"] &&
        !settings["jwt-enabled"],
    },
  ]),
);

PLUGIN_ADMIN_SETTINGS_UPDATES.push(sections => ({
  ...sections,
  "authentication/saml": {
    sidebar: false,
    component: SettingsSAMLForm,
    settings: [
      {
        key: "saml-enabled",
        display_name: t`SAML Authentication`,
        description: jt`Use the settings below to configure your SSO via SAML. If you have any questions, check out our ${(
          <ExternalLink
            href={MetabaseSettings.docsUrl(
              "enterprise-guide/authenticating-with-saml",
            )}
          >
            {t`documentation`}
          </ExternalLink>
        )}.`,
        type: "boolean",
      },
      {
        key: "saml-identity-provider-uri",
        display_name: t`SAML Identity Provider SSO URL`,
        placeholder: "https://example.com/app/my_saml_app/abc123/sso/saml",
        type: "string",
        required: true,
        autoFocus: true,
      },
      {
        key: "saml-identity-provider-issuer",
        display_name: t`SAML Identity Provider Issuer`,
        placeholder: "http://www.example.com/abc123",
        type: "string",
        required: false,
      },
      {
        key: "saml-identity-provider-certificate",
        display_name: t`SAML Identity Provider Certificate`,
        type: "text",
        required: true,
      },
      {
        key: "saml-application-name",
        display_name: t`SAML Application Name`,
        type: "string",
      },
      {
        key: "saml-keystore-path",
        display_name: t`SAML Keystore Path`,
        type: "string",
      },
      {
        key: "saml-keystore-password",
        display_name: t`SAML Keystore Password`,
        placeholder: "Shh...",
        type: "password",
      },
      {
        key: "saml-keystore-alias",
        display_name: t`SAML Keystore Alias`,
        type: "string",
      },
      {
        key: "saml-attribute-email",
        display_name: t`Email attribute`,
        type: "string",
      },
      {
        key: "saml-attribute-firstname",
        display_name: t`First name attribute`,
        type: "string",
      },
      {
        key: "saml-attribute-lastname",
        display_name: t`Last name attribute`,
        type: "string",
      },
      {
        key: "saml-group-sync",
        display_name: t`Synchronize group memberships`,
        description: null,
        widget: GroupMappingsWidget,
        props: {
          mappingSetting: "saml-group-mappings",
          groupHeading: t`Group Name`,
          groupPlaceholder: "Group Name",
        },
      },
      {
        key: "saml-attribute-group",
        display_name: t`Group attribute name`,
        type: "string",
      },
      {
        key: "saml-group-mappings",
      },
    ],
  },
  "authentication/jwt": {
    sidebar: false,
    component: SettingsJWTForm,
    settings: [
      {
        key: "jwt-enabled",
        description: null,
        getHidden: settings => settings["jwt-enabled"],
        onChanged: async (
          oldValue,
          newValue,
          settingsValues,
          onChangeSetting,
        ) => {
          // Generate a secret key if none already exists
          if (!oldValue && newValue && !settingsValues["jwt-shared-secret"]) {
            const result = await UtilApi.random_token();
            await onChangeSetting("jwt-shared-secret", result.token);
          }
        },
      },
      {
        key: "jwt-enabled",
        display_name: t`JWT Authentication`,
        type: "boolean",
        getHidden: settings => !settings["jwt-enabled"],
      },
      {
        key: "jwt-identity-provider-uri",
        display_name: t`JWT Identity Provider URI`,
        placeholder: "https://jwt.yourdomain.org",
        type: "string",
        required: true,
        autoFocus: true,
        getHidden: settings => !settings["jwt-enabled"],
      },
      {
        key: "jwt-shared-secret",
        display_name: t`String used by the JWT signing key`,
        type: "text",
        required: true,
        widget: SecretKeyWidget,
        getHidden: settings => !settings["jwt-enabled"],
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
        widget: GroupMappingsWidget,
        props: {
          mappingSetting: "jwt-group-mappings",
          groupHeading: t`Group Name`,
          groupPlaceholder: "Group Name",
        },
      },
      {
        key: "jwt-group-mappings",
      },
    ],
  },
}));

const SSO_PROVIDER = {
  name: "sso",
  Button: SSOButton,
};

PLUGIN_AUTH_PROVIDERS.push(providers => {
  if (MetabaseSettings.get("other-sso-configured?")) {
    providers = [SSO_PROVIDER, ...providers];
  }
  if (!MetabaseSettings.get("enable-password-login")) {
    providers = providers.filter(p => p.name !== "password");
  }
  return providers;
});

PLUGIN_SHOW_CHANGE_PASSWORD_CONDITIONS.push(
  user =>
    !user.google_auth &&
    !user.ldap_auth &&
    MetabaseSettings.get("enable-password-login"),
);

PLUGIN_ADMIN_SETTINGS_UPDATES.push(sections =>
  updateIn(sections, ["authentication/ldap", "settings"], settings => [
    ...settings,
    {
      key: "ldap-group-membership-filter",
      display_name: t`Group membership filter`,
      type: "string",
      validations: [
        value =>
          (value.match(/\(/g) || []).length !==
          (value.match(/\)/g) || []).length
            ? t`Check your parentheses`
            : null,
      ],
    },
    {
      key: "ldap-sync-admin-group",
      display_name: t`Sync Administrator group`,
      type: "boolean",
    },
  ]),
);

PLUGIN_ADMIN_SETTINGS_UPDATES.push(sections => ({
  ...sections,
  "authentication/google": {
    component: SettingsGoogleForm,
    sidebar: false,
    settings: [
      {
        key: "google-auth-client-id",
      },
      {
        // Default to OSS fields if enterprise SSO is not enabled
        ...sections["authentication/google"].settings.find(
          setting => setting.key === "google-auth-auto-create-accounts-domain",
        ),
        ...(hasPremiumFeature("sso") && {
          placeholder: "mycompany.com, example.com.br, otherdomain.co.uk",
          description:
            "Allow users to sign up on their own if their Google account email address is from one of the domains you specify here:",
        }),
      },
    ],
  },
}));
