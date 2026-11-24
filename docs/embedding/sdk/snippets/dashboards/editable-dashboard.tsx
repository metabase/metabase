import {
  EditableDashboard,
  MetabaseProvider,
  defineMetabaseAuthConfig,
} from "@metabase/embedding-sdk-react";
import React from "react";

const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://your-metabase.example.com",
});

export default function App() {
  const dashboardId = 1; // This is the dashboard ID you want to embed

  return (
    <MetabaseProvider authConfig={authConfig}>
      <EditableDashboard dashboardId={dashboardId} />
    </MetabaseProvider>
  );
}
