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

export type EditableDashboardWebComponentProps = Pick<
  EditableDashboardProps,
  "dashboardId"
>;

const InteractiveDashboardWebComponent =
  createWebComponent<EditableDashboardWebComponentProps>(
    ({ container, slot, ...props }) => <EditableDashboard {...props} />,
    {
      propTypes: {
        dashboardId: "id",
      },
    },
  );

registerWebComponent("editable-dashboard", InteractiveDashboardWebComponent);
