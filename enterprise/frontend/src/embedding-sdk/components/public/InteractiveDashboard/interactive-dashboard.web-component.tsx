import { createWebComponent } from "embedding-sdk/lib/web-components/create-web-component";

import {
  EditableDashboard,
  type EditableDashboardProps,
  type InteractiveDashboardProps,
} from "../InteractiveDashboard";

export type InteractiveDashboardWebComponentAttributes = {
  "dashboard-id": InteractiveDashboardProps["dashboardId"];
};

const InteractiveDashboardWebComponent = createWebComponent<
  Pick<EditableDashboardProps, "dashboardId">
>(({ dashboardId }) => <EditableDashboard dashboardId={dashboardId} />, {
  props: {
    dashboardId: "number",
  },
});

customElements.define(
  "interactive-dashboard",
  InteractiveDashboardWebComponent,
);
