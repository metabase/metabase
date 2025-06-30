import {
  createWebComponent,
  registerWebComponent,
} from "embedding-sdk/lib/web-components";

import {
  InteractiveDashboard,
  type InteractiveDashboardProps,
} from "../InteractiveDashboard";

export type InteractiveDashboardWebComponentAttributes = {
  "dashboard-id": string;
  "with-downloads"?: string;
};

const InteractiveDashboardWebComponent = createWebComponent<
  Pick<InteractiveDashboardProps, "dashboardId" | "withDownloads">
>((props) => <InteractiveDashboard {...props} />, {
  propTypes: {
    dashboardId: "id",
    withDownloads: "boolean",
  },
});

registerWebComponent("interactive-dashboard", InteractiveDashboardWebComponent);
