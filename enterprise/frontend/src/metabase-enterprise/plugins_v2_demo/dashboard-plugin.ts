import { createPlugin } from "metabase/lib/plugins-v2";

export const dashboardEePlugin = createPlugin(
  "ee-demo-dashboard-header-2",
  ({ override }) => {
    override("dashboard.header.label", () => "this is enterprise");

    override("dashboard.header.alertAction", ({ dashboardId }) => {
      alert(`enterprise click on dashboard ${dashboardId}`);
    });
  },
);
