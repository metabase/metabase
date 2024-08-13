import Modal from "metabase/components/Modal";
import { CreateDashboardModalConnected } from "metabase/dashboard/containers/CreateDashboardModal";
import type { CollectionId, Dashboard } from "metabase-types/api";

interface DashboardCreateModalProps {
  collectionId?: CollectionId | null;
  onCreate: (dashboard: Dashboard) => void;
  onClose?: () => void;
}

export const DashboardCreateModal = (props: DashboardCreateModalProps) => {
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
