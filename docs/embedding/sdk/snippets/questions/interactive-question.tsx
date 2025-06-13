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
  const questionId = 1; // This is the question ID you want to embed

  return (
    <MetabaseProvider authConfig={authConfig}>
      <Question questionId={questionId} />
    </MetabaseProvider>
  );
}
