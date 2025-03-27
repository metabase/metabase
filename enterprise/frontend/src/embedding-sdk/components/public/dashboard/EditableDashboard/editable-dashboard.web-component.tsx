import { defineWebComponent } from "embedding-sdk/lib/web-components";

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

defineWebComponent<EditableDashboardWebComponentProps>(
  "editable-dashboard",
  ({ container, slot, ...props }) => <EditableDashboard {...props} />,
  {
    propTypes: {
      dashboardId: "id",
    },
  },
);
