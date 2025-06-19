import {
  createWebComponent,
  registerWebComponent,
} from "embedding-sdk/lib/web-components";

import {
  EditableDashboard,
  type EditableDashboardProps,
} from "../InteractiveDashboard";

export type EditableDashboardWebComponentAttributes = {
  "dashboard-id": EditableDashboardProps["dashboardId"];
};

const InteractiveDashboardWebComponent = createWebComponent<
  Pick<EditableDashboardProps, "dashboardId">
>(({ dashboardId }) => <EditableDashboard dashboardId={dashboardId} />, {
  props: {
    dashboardId: "number",
  },
});

registerWebComponent("editable-dashboard", InteractiveDashboardWebComponent);
