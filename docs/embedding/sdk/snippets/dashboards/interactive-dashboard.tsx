import React from "react";
import {
  InteractiveDashboard,
  MetabaseProvider,
  defineMetabaseAuthConfig,
} from "@metabase/embedding-sdk-react";

const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://your-metabase.example.com",
  authProviderUri: "https://your-app.example.com/sso/metabase",
});

export default function App() {
  const dashboardId = 1; // This is the dashboard ID you want to embed
  const initialParameters = {}; // Define your query parameters here

  // choose parameter names that are in your dashboard
  const hiddenParameters = ["location", "city"];

  return (
    <MetabaseProvider authConfig={authConfig}>
      <InteractiveDashboard
        dashboardId={dashboardId}
        initialParameters={initialParameters}
        withTitle={false}
        withDownloads={false}
        hiddenParameters={hiddenParameters}
      />
    </MetabaseProvider>
  );
}
