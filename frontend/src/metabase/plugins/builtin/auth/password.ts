import { PLUGIN_AUTH_PROVIDERS } from "metabase/plugins";

PLUGIN_AUTH_PROVIDERS.push(providers => {
  const passwordProvider = {
    name: "password",
    // circular dependencies
    Button: require("metabase/auth/components/PasswordButton").PasswordButton,
    Panel: require("metabase/auth/components/PasswordPanel").PasswordPanel,
  };

  return [...providers, passwordProvider];
});
