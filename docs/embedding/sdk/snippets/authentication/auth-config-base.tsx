import { defineMetabaseAuthConfig } from "@metabase/embedding-sdk-react";

// [<snippet example>]
const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://your-metabase.example.com", // Required: Your Metabase instance URL
});
// [<endsnippet example>]
