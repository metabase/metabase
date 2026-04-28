import { createPlugin } from "metabase/lib/plugins-v2";

export const dashboardSdkPlugin = createPlugin(
  "sdk-demo-plugin",
  ({ override }) => {
    override(
      "dashboard.header.label",
      (params) => `this is dashboard ${params.dashboardName} in the react SDK`,
    );

    override("dashboard.header.alertAction", () => {
      alert("sdk click");
    });
  },
);
