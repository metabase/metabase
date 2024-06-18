import { PLUGIN_AUTH_PROVIDERS } from "metabase/plugins";

PLUGIN_AUTH_PROVIDERS.push(providers => {
  const oauthProvider = {
    name: "oauth",
    // circular dependencies
    Button: require("metabase/auth/components/OAuthButton").OAuthButton,
  };

  return [...providers, oauthProvider];
});
