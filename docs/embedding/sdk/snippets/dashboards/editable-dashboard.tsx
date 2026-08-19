import React from "react";
import {
  EditableDashboard,
  MetabaseProvider,
  defineMetabaseAuthConfig,
} from "@metabase/embedding-sdk-react";

const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://your-metabase.example.com",
});

export default function App() {
  const dashboardId = "Xk3YzAbCdEfGhIjKlMnOp"; // Entity ID of the dashboard you want to embed. A sequential ID like 1 works too.

  return (
    <MetabaseProvider authConfig={authConfig}>
      <EditableDashboard dashboardId={dashboardId} />
    </MetabaseProvider>
  );
}
