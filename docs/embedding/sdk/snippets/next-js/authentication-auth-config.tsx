import { defineMetabaseAuthConfig } from "@metabase/embedding-sdk-react/nextjs";

const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://metabase.example.com", // Required: Your Metabase instance URL
  authProviderUri: "/sso/metabase", // Required: An endpoint in your app that signs the user in and returns a session
});
