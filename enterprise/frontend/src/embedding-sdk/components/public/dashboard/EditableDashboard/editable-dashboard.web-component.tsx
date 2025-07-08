import { WebComponentProviders } from "embedding-sdk/components/private/WebComponentProviders/WebComponentProviders";
import { defineWebComponent } from "embedding-sdk/lib/web-components";

import {
  type MetabaseProviderWebComponentContextProps,
  metabaseProviderContextProps,
} from "../../metabase-provider.web-component";
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

defineWebComponent<
  MetabaseProviderWebComponentContextProps & EditableDashboardWebComponentProps
>(
  "editable-dashboard",
  ({ container, slot, metabaseProviderProps, ...props }) => (
    <WebComponentProviders metabaseProviderProps={metabaseProviderProps}>
      <EditableDashboard {...props} />
    </WebComponentProviders>
  ),
  {
    propTypes: {
      ...metabaseProviderContextProps,
      dashboardId: "id",
    },
  },
);
