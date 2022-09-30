import { PLUGIN_AUTH_PROVIDERS } from "metabase/plugins";

PLUGIN_AUTH_PROVIDERS.push(providers => {
  const passwordProvider = {
    name: "password",
    // circular dependencies
    Button: require("metabase/auth/containers/PasswordButton").default,
    Panel: require("metabase/auth/containers/PasswordPanel").default,
  };

  return [...providers, passwordProvider];
});
