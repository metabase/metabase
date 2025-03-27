import { defineWebComponent } from "embedding-sdk/lib/web-components";

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

defineWebComponent<CreateDashboardModalWebComponentProps>(
  "create-dashboard-modal",
  ({ container, slot, ...props }) => <CreateDashboardModal {...props} />,
  {
    propTypes: {
      initialCollectionId: "id",
      onCreate: "function",
    },
  },
);
