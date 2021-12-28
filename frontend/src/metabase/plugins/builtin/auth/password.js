import { PLUGIN_AUTH_PROVIDERS } from "metabase/plugins";

PLUGIN_AUTH_PROVIDERS.push(providers => {
  const PASSWORD_PROVIDER = {
    name: "password",
    Button: require("metabase/auth/components/PasswordButton").default,
    Panel: require("metabase/auth/containers/PasswordPanel").default,
  };

  return [...providers, PASSWORD_PROVIDER];
});
