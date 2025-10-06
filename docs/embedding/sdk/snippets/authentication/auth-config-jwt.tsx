import { defineMetabaseAuthConfig } from "@metabase/embedding-sdk-react";

const yourToken = "token";

// [<snippet example>]
// Pass this configuration to MetabaseProvider.
// Wrap the fetchRequestToken function in useCallback if it has dependencies to prevent re-renders.
const authConfig = defineMetabaseAuthConfig({
  fetchRequestToken: async () => {
    const response = await fetch(
      "https://{{ YOUR_CLIENT_HOST }}/api/metabase/auth",
      {
        method: "GET",
        headers: { Authorization: `Bearer ${yourToken}` },
      },
    );

    // The backend should return a JSON object with the shape { jwt: string }
    return await response.json();
  },
  metabaseInstanceUrl: "http://localhost:3000",
});
// [<endsnippet example>]
