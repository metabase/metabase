import React from "react";
import {
  MetabaseProvider,
  StaticQuestion,
  defineMetabaseAuthConfig,
} from "@metabase/embedding-sdk-react";

const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://your-metabase.example.com",
});

export default function App() {
  const questionId = "Pq7RsTuVwXyZaBcDeFgHi"; // Entity ID of the question you want to embed. A sequential ID like 1 works too.

  return (
    <MetabaseProvider authConfig={authConfig}>
      <StaticQuestion questionId={questionId} withChartTypeSelector={false} />
    </MetabaseProvider>
  );
}
