import { t } from "ttag";

import { Button, Modal, Text } from "metabase/ui";

type DeleteAlertConfirmModalProps = {
  title?: string;
  onConfirm: () => void;
  onClose: () => void;
};

export const DeleteAlertConfirmModal = ({
  title,
  onConfirm,
  onClose,
}: DeleteAlertConfirmModalProps) => (
  <Modal
    opened
    data-testid="alert-delete"
    title={title || t`Delete this alert?`}
    size="lg"
    onClose={onClose}
  >
    <Text>{t`This can't be undone.`}</Text>
    <Modal.Footer>
      <Button onClick={onClose}>{t`Cancel`}</Button>
      <Button
        variant="filled"
        color="negative"
        onClick={onConfirm}
      >{t`Delete it`}</Button>
    </Modal.Footer>
  </Modal>
);
