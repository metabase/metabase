import { t } from "ttag";
import { updateIn } from "icepick";

import {
  PLUGIN_AUTH_PROVIDERS,
  PLUGIN_ADMIN_SETTINGS_UPDATES,
  PLUGIN_IS_PASSWORD_USER,
} from "metabase/plugins";

import MetabaseSettings from "metabase/lib/settings";

import AuthenticationOption from "metabase/admin/settings/components/widgets/AuthenticationOption";
import SettingsGoogleForm from "metabase/admin/settings/components/SettingsGoogleForm";

PLUGIN_AUTH_PROVIDERS.push(providers => {
  const googleProvider = {
    name: "google",
    // circular dependencies
    Button: require("metabase/auth/containers/GoogleButton").default,
  };

  return MetabaseSettings.isGoogleAuthConfigured()
    ? [googleProvider, ...providers]
    : providers;
});

PLUGIN_ADMIN_SETTINGS_UPDATES.push(sections =>
  updateIn(sections, ["authentication", "settings"], settings => [
    ...settings,
    {
      authName: t`Sign in with Google`,
      authDescription: t`Allows users with existing Metabase accounts to login with a Google account that matches their email address in addition to their Metabase username and password.`,
      authType: "google",
      authEnabled: settings => !!settings["google-auth-client-id"],
      widget: AuthenticationOption,
    },
  ]),
);

PLUGIN_ADMIN_SETTINGS_UPDATES.push(sections => ({
  ...sections,
  "authentication/google": {
    component: SettingsGoogleForm,
    settings: [
      {
        key: "google-auth-client-id",
      },
      {
        key: "google-auth-auto-create-accounts-domain",
        description:
          "Allow users to sign up on their own if their Google account email address is from:",
        placeholder: "mycompany.com",
      },
    ],
  },
}));

PLUGIN_IS_PASSWORD_USER.push(user => !user.google_auth);
