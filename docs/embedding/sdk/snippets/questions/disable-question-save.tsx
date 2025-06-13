import React from "react";
import {
  Question,
  MetabaseProvider,
  defineMetabaseAuthConfig,
} from "@metabase/embedding-sdk-react";

const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://your-metabase.example.com",
});

export default function App() {
  return (
    <MetabaseProvider authConfig={authConfig}>
      <Question questionId={1} isSaveEnabled={false} />
    </MetabaseProvider>
  );
}
