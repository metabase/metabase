import { t } from "ttag";

import { Button, Flex, Modal, Text } from "metabase/ui";

type DeleteConfirmModalProps = {
  title?: string;
  onConfirm: () => void;
  onClose: () => void;
};

export const DeleteConfirmModal = ({
  title,
  onConfirm,
  onClose,
}: DeleteConfirmModalProps) => (
  <Modal
    opened
    data-testid="delete-confirm"
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
