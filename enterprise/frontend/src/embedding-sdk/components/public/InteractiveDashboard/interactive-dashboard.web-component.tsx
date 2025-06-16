import {
  createWebComponent,
  registerWebComponent,
} from "embedding-sdk/lib/web-components";

import {
  InteractiveDashboard,
  type InteractiveDashboardProps,
} from "../InteractiveDashboard";

export type InteractiveDashboardWebComponentAttributes = {
  "dashboard-id": InteractiveDashboardProps["dashboardId"];
};

const InteractiveDashboardWebComponent = createWebComponent<
  Pick<InteractiveDashboardProps, "dashboardId">
>(({ dashboardId }) => <InteractiveDashboard dashboardId={dashboardId} />, {
  props: {
    dashboardId: "number",
  },
});

registerWebComponent("interactive-dashboard", InteractiveDashboardWebComponent);
