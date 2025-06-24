import { defineMetabaseAuthConfig } from "@metabase/embedding-sdk-react";

// [<snippet example>]
const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://your-metabase.example.com", // Required: Your Metabase instance URL
  authProviderUri: "https://your-app.example.com/sso/metabase", // Required: An endpoint in your app that signs the user in and returns a session
});
// [<endsnippet example>]
