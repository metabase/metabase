import {
  createWebComponent,
  registerWebComponent,
} from "embedding-sdk/lib/web-components";

import {
  EditableDashboard,
  type EditableDashboardProps,
} from "../EditableDashboard";

export type EditableDashboardWebComponentAttributes = {
  "dashboard-id": string;
};

const InteractiveDashboardWebComponent = createWebComponent<
  Pick<EditableDashboardProps, "dashboardId">
>((props) => <EditableDashboard {...props} />, {
  propTypes: {
    dashboardId: "id",
  },
});

registerWebComponent("editable-dashboard", InteractiveDashboardWebComponent);
