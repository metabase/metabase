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

export type CreateDashboardModalWebComponentProps = Pick<
  CreateDashboardModalProps,
  "initialCollectionId" | "onCreate"
>;

const CreateDashboardModalWebComponent =
  createWebComponent<CreateDashboardModalWebComponentProps>(
    (props) => <CreateDashboardModal {...props} />,
    {
      propTypes: {
        initialCollectionId: "id",
        onCreate: "function",
      },
    },
  );

registerWebComponent(
  "create-dashboard-modal",
  CreateDashboardModalWebComponent,
);
