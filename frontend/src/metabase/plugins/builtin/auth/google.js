import { updateIn } from "icepick";

import {
  PLUGIN_AUTH_PROVIDERS,
  PLUGIN_ADMIN_SETTINGS_UPDATES,
  PLUGIN_IS_PASSWORD_USER,
} from "metabase/plugins";

import MetabaseSettings from "metabase/lib/settings";

import SettingsGoogleForm from "metabase/admin/settings/components/SettingsGoogleForm";
import GoogleAuthCard from "metabase/admin/settings/auth/containers/GoogleAuthCard";

PLUGIN_AUTH_PROVIDERS.push(providers => {
  const googleProvider = {
    name: "google",
    // circular dependencies
    Button: require("metabase/auth/containers/GoogleButton").default,
  };

  return MetabaseSettings.isGoogleAuthEnabled()
    ? [googleProvider, ...providers]
    : providers;
});

PLUGIN_ADMIN_SETTINGS_UPDATES.push(sections =>
  updateIn(sections, ["authentication", "settings"], settings => [
    ...settings,
    {
      key: "google-auth-enabled",
      description: null,
      noHeader: true,
      widget: GoogleAuthCard,
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
        required: true,
        autoFocus: true,
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
