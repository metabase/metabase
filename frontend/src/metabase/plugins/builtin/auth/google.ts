import MetabaseSettings from "metabase/lib/settings";
import {
  PLUGIN_AUTH_PROVIDERS,
  PLUGIN_IS_PASSWORD_USER,
} from "metabase/plugins";

PLUGIN_AUTH_PROVIDERS.providers.push((providers) => {
  const googleProvider = {
    name: "google",
    // circular dependencies
    /* eslint-disable @typescript-eslint/no-var-requires */
    Button: require("metabase/auth/components/GoogleButton").GoogleButton,
  };

  return MetabaseSettings.isGoogleAuthEnabled()
    ? [googleProvider, ...providers]
    : providers;
});

PLUGIN_IS_PASSWORD_USER.push((user) => user.sso_source !== "google");
