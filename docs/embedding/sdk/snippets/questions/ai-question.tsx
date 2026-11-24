import {
  MetabotQuestion,
  MetabaseProvider,
  defineMetabaseAuthConfig,
} from "@metabase/embedding-sdk-react";
import React from "react";

const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://your-metabase.example.com",
});

export default function App() {
  return (
    <MetabaseProvider authConfig={authConfig}>
      <MetabotQuestion />
    </MetabaseProvider>
  );
}
