import { PLUGIN_AUTH_PROVIDERS } from "metabase/plugins";
import PasswordButton from "metabase/auth/components/PasswordButton";

const PASSWORD_PROVIDER = {
  name: "password",
  Button: PasswordButton,
};

PLUGIN_AUTH_PROVIDERS.push(providers => [...providers, PASSWORD_PROVIDER]);
