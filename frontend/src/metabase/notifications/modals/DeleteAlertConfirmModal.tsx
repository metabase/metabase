import { t } from "ttag";

import { Button, Flex, Modal, Text } from "metabase/ui";

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
    <Text py="1rem">{t`This can't be undone.`}</Text>
    <Flex justify="flex-end" gap="0.75rem">
      <Button onClick={onClose}>{t`Cancel`}</Button>
      <Button
        variant="filled"
        color="error"
        onClick={onConfirm}
      >{t`Delete it`}</Button>
    </Flex>
  </Modal>
);
