import _ from "underscore";

import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import Modal from "metabase/components/Modal";
import { CreateDashboardModalConnected } from "metabase/dashboard/containers/CreateDashboardModal";
import Collections from "metabase/entities/collections";
import type { CollectionId, Dashboard } from "metabase-types/api";
import type { State } from "metabase-types/store";

export interface CreateDashboardModalProps {
  initialCollectionId?: CollectionId | null;
  onCreate: (dashboard: Dashboard) => void;
  onClose?: () => void;
}

const CreateDashboardModalInner = (props: CreateDashboardModalProps) => {
  const { initialCollectionId, onCreate, onClose } = props;

  return (
    <Modal onClose={onClose}>
      <CreateDashboardModalConnected
        onCreate={onCreate}
        onClose={onClose}
        collectionId={initialCollectionId}
      />
    </Modal>
  );
};

export const CreateDashboardModal = _.compose(
  withPublicComponentWrapper,
  Collections.load({
    id: (_state: State, props: CreateDashboardModalProps) =>
      props.initialCollectionId,
    loadingAndErrorWrapper: false,
  }),
)(CreateDashboardModalInner);
