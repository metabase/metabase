import { defineWebComponent } from "embedding-sdk/lib/web-components";

import { StaticDashboard, type StaticDashboardProps } from "../StaticDashboard";

export type StaticDashboardWebComponentAttributes = {
  "dashboard-id": string;
  "with-downloads"?: string;
};

export type StaticDashboardWebComponentProps = Pick<
  StaticDashboardProps,
  "dashboardId" | "withDownloads"
>;

defineWebComponent<StaticDashboardWebComponentProps>(
  "static-dashboard",
  ({ container, slot, ...props }) => <StaticDashboard {...props} />,
  {
    propTypes: {
      dashboardId: "id",
      withDownloads: "boolean",
    },
  },
);
