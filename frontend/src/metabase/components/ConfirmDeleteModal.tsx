import { t } from "ttag";

import { ConfirmModal } from "./ConfirmModal";

interface ConfirmDeleteModalProps {
  name: string;
  onClose: () => void;
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
    <ConfirmModal
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
