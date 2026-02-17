import { PLUGIN_AUTH_PROVIDERS } from "metabase/plugins";

PLUGIN_AUTH_PROVIDERS.providers.push((providers) => {
  const passwordProvider = {
    name: "password",
    // circular dependencies
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Button: require("metabase/auth/components/PasswordButton").PasswordButton,
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Panel: require("metabase/auth/components/PasswordPanel").PasswordPanel,
  };

  return [...providers, passwordProvider];
});
