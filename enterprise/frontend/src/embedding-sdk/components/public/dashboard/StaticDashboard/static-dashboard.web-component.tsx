import { WebComponentProviders } from "embedding-sdk/components/private/WebComponentProviders/WebComponentProviders";
import { defineWebComponent } from "embedding-sdk/lib/web-components";

import {
  type MetabaseProviderWebComponentContextProps,
  metabaseProviderContextProps,
} from "../../metabase-provider.web-component";
import { StaticDashboard, type StaticDashboardProps } from "../StaticDashboard";

export type StaticDashboardWebComponentAttributes = {
  "dashboard-id": string;
  "with-downloads"?: string;
};

export type StaticDashboardWebComponentProps = Pick<
  StaticDashboardProps,
  "dashboardId" | "withDownloads"
>;

defineWebComponent<
  MetabaseProviderWebComponentContextProps & StaticDashboardWebComponentProps
>(
  "static-dashboard",
  ({ container, slot, metabaseProviderProps, ...props }) => (
    <WebComponentProviders metabaseProviderProps={metabaseProviderProps}>
      <StaticDashboard {...props} />
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
