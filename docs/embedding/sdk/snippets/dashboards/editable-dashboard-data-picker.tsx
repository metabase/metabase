import React from "react";
import { EditableDashboard } from "@metabase/embedding-sdk-react";

export default function TablesOnlyDashboard() {
  const dashboardId = 1; // This is the dashboard ID you want to embed

  return (
    <EditableDashboard
      dashboardId={dashboardId}
      dataPickerProps={{ entityTypes: ["table"] }}
    />
  );
}
