import { t } from "ttag";

import { Button, Modal } from "metabase/ui";

export interface DeleteConfirmationFooterProps {
  onDelete: () => void;
  onCancel: () => void;
}

export const DeleteConfirmationFooter = ({
  onDelete,
  onCancel,
}: DeleteConfirmationFooterProps) => (
  <Modal.Footer>
    <Button onClick={onCancel}>{t`Cancel`}</Button>
    <Button
      variant="filled"
      color="negative"
      onClick={onDelete}
    >{t`Delete`}</Button>
  </Modal.Footer>
);
