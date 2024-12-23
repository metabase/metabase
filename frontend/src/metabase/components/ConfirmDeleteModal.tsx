import { t } from "ttag";

import ConfirmContent from "metabase/components/ConfirmContent";
import Modal from "metabase/components/Modal";
import type { ModalProps } from "metabase/components/Modal/Modal";

interface ConfirmDeleteModalProps extends ModalProps {
  name: string;
  onDelete: () => void;
}

export const ConfirmDeleteModal = ({
  name,
  onClose,
  onDelete,
  ...props
}: ConfirmDeleteModalProps) => {
  return (
    <Modal onClose={onClose} {...props}>
      <ConfirmContent
        cancelButtonText={t`Cancel`}
        confirmButtonText={t`Delete permanently`}
        data-testid="delete-confirmation"
        message={t`This can't be undone.`}
        title={t`Delete ${name} permanently?`}
        onAction={onDelete}
        onCancel={onClose}
        onClose={onClose}
      />
    </Modal>
  );
};
