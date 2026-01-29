import { GoogleButton } from "metabase/auth/components/GoogleButton";
import MetabaseSettings from "metabase/lib/settings";
import {
  PLUGIN_AUTH_PROVIDERS,
  PLUGIN_IS_PASSWORD_USER,
} from "metabase/plugins";

PLUGIN_AUTH_PROVIDERS.providers.push((providers) => {
  const googleProvider = {
    name: "google",
    Button: GoogleButton,
  };

  return MetabaseSettings.isGoogleAuthEnabled()
    ? [googleProvider, ...providers]
    : providers;
});

PLUGIN_IS_PASSWORD_USER.push((user) => user.sso_source !== "google");
