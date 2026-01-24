import { PLUGIN_AUTH_PROVIDERS } from "metabase/plugins";

PLUGIN_AUTH_PROVIDERS.providers.push((providers) => {
  const passwordProvider = {
    name: "password",
    // circular dependencies
    /* eslint-disable @typescript-eslint/no-var-requires */
    Button: require("metabase/auth/components/PasswordButton").PasswordButton,
    /* eslint-disable @typescript-eslint/no-var-requires */
    Panel: require("metabase/auth/components/PasswordPanel").PasswordPanel,
  };

  return [...providers, passwordProvider];
});
