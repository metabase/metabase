import { PLUGIN_AUTH_PROVIDERS } from "metabase/plugins";

PLUGIN_AUTH_PROVIDERS.push(providers => {
  return [
    ...providers,
    {
      name: "password",
      // circular dependencies
      Button: require("metabase/auth/components/PasswordButton").default,
      Panel: require("metabase/auth/containers/PasswordPanel").default,
    },
  ];
});
