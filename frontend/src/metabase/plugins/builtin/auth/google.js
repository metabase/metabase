import { updateIn } from "icepick";

import GoogleAuthCard from "metabase/admin/settings/auth/containers/GoogleAuthCard";
import GoogleSettingsForm from "metabase/admin/settings/auth/containers/GoogleAuthForm";
import MetabaseSettings from "metabase/lib/settings";
import {
  PLUGIN_AUTH_PROVIDERS,
  PLUGIN_ADMIN_SETTINGS_UPDATES,
  PLUGIN_IS_PASSWORD_USER,
} from "metabase/plugins";

PLUGIN_AUTH_PROVIDERS.push(providers => {
  const googleProvider = {
    name: "google",
    // circular dependencies
    Button: require("metabase/auth/components/GoogleButton").GoogleButton,
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
    component: GoogleSettingsForm,
    settings: [
      { key: "google-auth-client-id" },
      { key: "google-auth-auto-create-accounts-domain" },
    ],
  },
}));

PLUGIN_IS_PASSWORD_USER.push(user => !user.google_auth);
