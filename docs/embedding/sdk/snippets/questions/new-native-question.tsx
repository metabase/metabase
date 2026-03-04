import React from "react";
import {
  InteractiveQuestion,
  MetabaseProvider,
  defineMetabaseAuthConfig,
} from "@metabase/embedding-sdk-react";

const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://your-metabase.example.com",
});

export default function App() {
  return (
    <MetabaseProvider authConfig={authConfig}>
      <InteractiveQuestion questionId="new-native" />
    </MetabaseProvider>
  );
}