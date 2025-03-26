import React from "react";
import {
  MetabaseProvider,
  StaticQuestion,
  defineMetabaseAuthConfig,
} from "@metabase/embedding-sdk-react";

const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://your-metabase.example.com",
  authProviderUri: "https://your-app.example.com/sso/metabase",
});

export default function App() {
  const questionId = 1; // This is the question ID you want to embed

  return (
    <MetabaseProvider authConfig={authConfig}>
      <StaticQuestion questionId={questionId} withChartTypeSelector={false} />
    </MetabaseProvider>
  );
}
