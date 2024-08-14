import Modal from "metabase/components/Modal";
import { CreateDashboardModalConnected } from "metabase/dashboard/containers/CreateDashboardModal";
import Collections from "metabase/entities/collections";
import type { CollectionId, Dashboard } from "metabase-types/api";
import type { State } from "metabase-types/store";

export interface DashboardCreateModalProps {
  collectionId?: CollectionId | null;
  onCreate: (dashboard: Dashboard) => void;
  onClose?: () => void;
}

export const DashboardCreateModalInner = (props: DashboardCreateModalProps) => {
  const { collectionId, onCreate, onClose } = props;

  return (
    <Modal onClose={onClose}>
      <CreateDashboardModalConnected
        onCreate={onCreate}
        onClose={onClose}
        collectionId={collectionId}
      />
    </Modal>
  );
};

export const DashboardCreateModal = Collections.load({
  id: (_state: State, props: DashboardCreateModalProps) => props.collectionId,
  loadingAndErrorWrapper: false,
})(DashboardCreateModalInner);
