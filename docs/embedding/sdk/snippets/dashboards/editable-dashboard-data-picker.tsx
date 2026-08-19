import React from "react";
import { EditableDashboard } from "@metabase/embedding-sdk-react";

export default function TablesOnlyDashboard() {
  const dashboardId = "Xk3YzAbCdEfGhIjKlMnOp"; // Entity ID of the dashboard you want to embed. A sequential ID like 1 works too.

  return (
    <EditableDashboard
      dashboardId={dashboardId}
      dataPickerProps={{ entityTypes: ["table"] }}
    />
  );
}
