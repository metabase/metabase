import React from "react";
import {
  MetabaseProvider,
  StaticDashboard,
  defineMetabaseAuthConfig,
} from "@metabase/embedding-sdk-react";

const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://your-metabase.example.com", // Required
});

export default function App() {
  return (
    <MetabaseProvider authConfig={authConfig}>
      {/* Metabase components go here */}
      <StaticDashboard dashboardId={1} />
    </MetabaseProvider>
  );
}
