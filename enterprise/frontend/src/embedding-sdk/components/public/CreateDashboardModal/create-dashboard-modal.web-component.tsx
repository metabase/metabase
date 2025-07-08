import { WebComponentProviders } from "embedding-sdk/components/private/WebComponentProviders/WebComponentProviders";
import { defineWebComponent } from "embedding-sdk/lib/web-components";

import {
  type MetabaseProviderWebComponentContextProps,
  metabaseProviderContextProps,
} from "../metabase-provider.web-component";

import {
  CreateDashboardModal,
  type CreateDashboardModalProps,
} from "./CreateDashboardModal";

export type CreateDashboardModalWebComponentAttributes = {
  "initial-collection-id": string;
  "on-create"?: string;
};

export type CreateDashboardModalWebComponentProps = Pick<
  CreateDashboardModalProps,
  "initialCollectionId" | "onCreate"
>;

export type CreateDashboardModalWebComponentProperties = Pick<
  CreateDashboardModalProps,
  "onCreate"
>;

defineWebComponent<
  MetabaseProviderWebComponentContextProps &
    CreateDashboardModalWebComponentProps,
  CreateDashboardModalWebComponentProperties
>(
  "create-dashboard-modal",
  ({ container, slot, metabaseProviderProps, ...props }) => (
    <WebComponentProviders metabaseProviderProps={metabaseProviderProps}>
      <CreateDashboardModal {...props} />
    </WebComponentProviders>
  ),
  {
    propTypes: {
      ...metabaseProviderContextProps,
      initialCollectionId: "id",
      onCreate: "function",
    },
    properties: ["onCreate"],
  },
);
