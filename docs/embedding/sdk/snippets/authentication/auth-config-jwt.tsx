import { defineMetabaseAuthConfig } from "@metabase/embedding-sdk-react";

const yourToken = "token";

// [<snippet example>]
// Pass this configuration to MetabaseProvider.
// Wrap the fetchRequestToken function in useCallback if it has dependencies to prevent re-renders.
const authConfig = defineMetabaseAuthConfig({
  fetchRequestToken: async url => {
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${yourToken}` },
    });

    return await response.json();
  },
  metabaseInstanceUrl: "http://localhost:3000",
  authProviderUri: "http://localhost:9090/sso/metabase",
});
// [<endsnippet example>]
