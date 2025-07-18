import { WebComponentProviders } from "embedding-sdk/components/private/WebComponentProviders/WebComponentProviders";
import { defineWebComponent } from "embedding-sdk/lib/web-components";

import {
  type MetabaseProviderWebComponentContextProps,
  metabaseProviderContextProps,
} from "../../metabase-provider.web-component";
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

defineWebComponent<
  MetabaseProviderWebComponentContextProps &
    InteractiveDashboardWebComponentProps
>(
  "interactive-dashboard",
  ({ container, slot, metabaseProviderProps, ...props }) => (
    <WebComponentProviders metabaseProviderProps={metabaseProviderProps}>
      <InteractiveDashboard {...props} />
    </WebComponentProviders>
  ),
  {
    propTypes: {
      ...metabaseProviderContextProps,
      dashboardId: "id",
      withDownloads: "boolean",
    },
  },
);
