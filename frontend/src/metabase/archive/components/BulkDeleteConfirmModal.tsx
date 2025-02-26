import { msgid, ngettext, t } from "ttag";

import { ConfirmationModal } from "metabase/components/ConfirmationModal";

interface BulkDeleteConfirmModalProps {
  selectedItemCount: number;
  onCloseModal: () => void;
  onBulkDeletePermanently: () => void;
  opened: boolean | undefined;
}

export const BulkDeleteConfirmModal = ({
  selectedItemCount,
  onCloseModal,
  onBulkDeletePermanently,
  opened,
}: BulkDeleteConfirmModalProps) => {
  return (
    <ConfirmationModal
      opened={opened}
      confirmButtonText={t`Delete permanently`}
      data-testid="leave-confirmation"
      message={t`This can't be undone.`}
      title={ngettext(
        msgid`Delete item permanently?`,
        `Delete ${selectedItemCount} items permanently?`,
        selectedItemCount,
      )}
      onConfirm={onBulkDeletePermanently}
      onClose={onCloseModal}
    />
  );
};
