import { PLUGIN_AUTH_PROVIDERS } from "metabase/plugins";
import PasswordButton from "metabase/auth/components/PasswordButton";
import PasswordPanel from "metabase/auth/containers/PasswordPanel";

const PASSWORD_PROVIDER = {
  name: "password",
  Button: PasswordButton,
  Panel: PasswordPanel,
};

PLUGIN_AUTH_PROVIDERS.push(providers => [...providers, PASSWORD_PROVIDER]);
