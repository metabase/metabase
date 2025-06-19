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
  propTypes: {
    dashboardId: "id",
  },
});

registerWebComponent("editable-dashboard", InteractiveDashboardWebComponent);
