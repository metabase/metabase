import { PasswordButton } from "metabase/auth/components/PasswordButton";
import { PasswordPanel } from "metabase/auth/components/PasswordPanel";
import { PLUGIN_AUTH_PROVIDERS } from "metabase/plugins";

PLUGIN_AUTH_PROVIDERS.providers.push((providers) => {
  const passwordProvider = {
    name: "password",
    Button: PasswordButton,
    Panel: PasswordPanel,
  };

  return [...providers, passwordProvider];
});
