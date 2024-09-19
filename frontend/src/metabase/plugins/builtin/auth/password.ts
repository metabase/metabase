import { PLUGIN_AUTH_PROVIDERS } from "metabase/plugins";

PLUGIN_AUTH_PROVIDERS.push(providers => {
  const passwordProvider = {
    name: "password",
    // eslint-disable-next-line @typescript-eslint/no-var-requires -- circular dependency
    Button: require("metabase/auth/components/PasswordButton").PasswordButton,
    // eslint-disable-next-line @typescript-eslint/no-var-requires -- deprecated usage
    Panel: require("metabase/auth/components/PasswordPanel").PasswordPanel,
  };

  return [...providers, passwordProvider];
});
