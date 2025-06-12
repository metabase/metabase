import {
  createWebComponent,
  registerWebComponent,
} from "embedding-sdk/lib/web-components";

import {
  CreateDashboardModal,
  type CreateDashboardModalProps,
} from "./CreateDashboardModal";

export type CreateDashboardModalWebComponentAttributes = {
  "initial-collection-id": string;
  "on-create": string;
};

const CreateDashboardModalWebComponent = createWebComponent<
  Pick<CreateDashboardModalProps, "initialCollectionId" | "onCreate">
>((props) => <CreateDashboardModal {...props} />, {
  propTypes: {
    initialCollectionId: "id",
    onCreate: "function",
  },
});

registerWebComponent(
  "create-dashboard-modal",
  CreateDashboardModalWebComponent,
);
