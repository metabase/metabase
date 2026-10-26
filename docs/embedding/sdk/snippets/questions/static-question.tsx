import {
  MetabaseProvider,
  StaticQuestion,
  defineMetabaseAuthConfig,
} from "@metabase/embedding-sdk-react";
import React from "react";

const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://your-metabase.example.com",
});

export default function App() {
  const questionId = 1; // This is the question ID you want to embed

  return (
    <MetabaseProvider authConfig={authConfig}>
      <StaticQuestion questionId={questionId} withChartTypeSelector={false} />
    </MetabaseProvider>
  );
}
