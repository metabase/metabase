import { defineMetabaseAuthConfig } from "@metabase/embedding-sdk-react/nextjs";

const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://metabase.example.com", // Required: Your Metabase instance URL
});
