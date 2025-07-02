import { defineMetabaseAuthConfig } from "@metabase/embedding-sdk-react";

// [<snippet example>]
// Pass this configuration to MetabaseProvider.
const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "http://localhost:3000",
  preferredAuthMethod: "saml",
});
// [<endsnippet example>]
