import { msgid, ngettext, t } from "ttag";

import ConfirmContent from "metabase/components/ConfirmContent";
import Modal from "metabase/components/Modal";

interface BulkDeleteConfirmModalProps {
  selectedItemCount: number;
  onCloseModal: () => void;
  onBulkDeletePermanently: () => void;
}

export const BulkDeleteConfirmModal = ({
  selectedItemCount,
  onCloseModal,
  onBulkDeletePermanently,
}: BulkDeleteConfirmModalProps) => {
  return (
    <Modal onClose={onCloseModal}>
      <ConfirmContent
        cancelButtonText={t`Cancel`}
        confirmButtonText={t`Delete permanently`}
        data-testid="leave-confirmation"
        message={t`This can't be undone.`}
        title={ngettext(
          msgid`Delete item permanently?`,
          `Delete ${selectedItemCount} items permanently?`,
          selectedItemCount,
        )}
        onAction={onBulkDeletePermanently}
        onCancel={onCloseModal}
        onClose={onCloseModal}
      />
    </Modal>
  );
};
