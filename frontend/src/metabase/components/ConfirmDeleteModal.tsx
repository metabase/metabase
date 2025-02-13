import { t } from "ttag";

import { ConfirmationModal } from "metabase/components/ConfirmContent";
import type { ModalProps } from "metabase/components/Modal/Modal";

interface ConfirmDeleteModalProps extends ModalProps {
  name: string;
  onDelete: () => void;
  opened: boolean | undefined;
}

export const ConfirmDeleteModal = ({
  name,
  onClose,
  onDelete,
  opened,
}: ConfirmDeleteModalProps) => {
  return (
    <ConfirmationModal
      opened={opened}
      confirmButtonText={t`Delete permanently`}
      data-testid="delete-confirmation"
      message={t`This can't be undone.`}
      title={t`Delete ${name} permanently?`}
      onConfirm={onDelete}
      onClose={onClose}
    />
  );
};
