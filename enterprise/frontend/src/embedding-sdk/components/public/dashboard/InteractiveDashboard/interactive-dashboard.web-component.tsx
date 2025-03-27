import { defineWebComponent } from "embedding-sdk/lib/web-components";

import {
  InteractiveDashboard,
  type InteractiveDashboardProps,
} from "../InteractiveDashboard";

export type InteractiveDashboardWebComponentAttributes = {
  "dashboard-id": string;
  "with-downloads"?: string;
};

export type InteractiveDashboardWebComponentProps = Pick<
  InteractiveDashboardProps,
  "dashboardId" | "withDownloads"
>;

defineWebComponent<InteractiveDashboardWebComponentProps>(
  "interactive-dashboard",
  ({ container, slot, ...props }) => <InteractiveDashboard {...props} />,
  {
    propTypes: {
      dashboardId: "id",
      withDownloads: "boolean",
    },
  },
);
