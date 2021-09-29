import { t } from "ttag";
import { updateIn } from "icepick";

import {
  PLUGIN_AUTH_PROVIDERS,
  PLUGIN_ADMIN_SETTINGS_UPDATES,
  PLUGIN_SHOW_CHANGE_PASSWORD_CONDITIONS,
} from "metabase/plugins";

import MetabaseSettings from "metabase/lib/settings";

import GoogleButton from "metabase/auth/components/GoogleButton";

import AuthenticationOption from "metabase/admin/settings/components/widgets/AuthenticationOption";
import SettingsGoogleForm from "metabase/admin/settings/components/SettingsGoogleForm";

const GOOGLE_PROVIDER = {
  name: "google",
  Button: GoogleButton,
};

PLUGIN_AUTH_PROVIDERS.push(providers =>
  MetabaseSettings.googleAuthEnabled()
    ? [GOOGLE_PROVIDER, ...providers]
    : providers,
);

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
    sidebar: false,
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

PLUGIN_SHOW_CHANGE_PASSWORD_CONDITIONS.push(user => !user.google_auth);
