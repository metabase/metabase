import { t } from "ttag";
import { updateIn } from "icepick";

import {
  PLUGIN_AUTH_PROVIDERS,
  PLUGIN_ADMIN_SETTINGS_UPDATES,
  PLUGIN_IS_PASSWORD_USER,
} from "metabase/plugins";

import MetabaseSettings from "metabase/lib/settings";

import AuthenticationWidget from "metabase/admin/settings/components/widgets/AuthenticationWidget";
import FormikForm from "metabase/containers/FormikForm";
import GoogleSettingsForm from "metabase/admin/settings/components/GoogleSettingsForm";

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
      widget: AuthenticationWidget,
      getProps: (setting, settings) => ({
        authType: "google",
        authName: t`Sign in with Google`,
        authDescription: t`Allows users with existing Metabase accounts to login with a Google account that matches their email address in addition to their Metabase username and password.`,
        authConfigured: Boolean(settings["google-auth-client-id"]),
      }),
    },
  ]),
);

PLUGIN_ADMIN_SETTINGS_UPDATES.push(sections => ({
  ...sections,
  "authentication/google": {
    component: GoogleSettingsForm ?? FormikForm,
    settings: [],
  },
}));

PLUGIN_IS_PASSWORD_USER.push(user => !user.google_auth);
