import React from "react";
import {
  InteractiveDashboard,
  MetabaseProvider,
  defineMetabaseAuthConfig,
} from "@metabase/embedding-sdk-react";

const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://your-metabase.example.com",
});

export default function App() {
  const dashboardId = "Xk3YzAbCdEfGhIjKlMnOp"; // Entity ID of the dashboard you want to embed. A sequential ID like 1 works too.
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
