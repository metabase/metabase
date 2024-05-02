import { t } from "ttag";

import ConfirmContent from "metabase/components/ConfirmContent";
import Modal from "metabase/components/Modal";

interface DeleteConfirmModalProps {
  name: string;
  onCloseModal: () => void;
  onDelete: () => void;
}

export const DeleteConfirmModal = ({
  name,
  onCloseModal,
  onDelete,
}: DeleteConfirmModalProps) => {
  return (
    <Modal onClose={onCloseModal}>
      <ConfirmContent
        cancelButtonText={t`Cancel`}
        confirmButtonText={t`Delete permanently`}
        data-testid="leave-confirmation"
        message={t`This can't be undone.`}
        title={t`Delete ${name} permanently?`}
        onAction={onDelete}
        onCancel={onCloseModal}
        onClose={onCloseModal}
      />
    </Modal>
  );
};
