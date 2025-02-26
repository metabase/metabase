import { t } from "ttag";

import { Button, Flex, Modal, Text } from "metabase/ui";

type UnsubscribeConfirmModalProps = {
  onConfirm: () => void;
  onClose: () => void;
};

export const UnsubscribeConfirmModal = ({
  onConfirm,
  onClose,
}: UnsubscribeConfirmModalProps) => (
  <Modal
    opened
    data-testid="alert-unsubscribe"
    title={t`Confirm you want to unsubscribe`}
    size="lg"
    onClose={onClose}
  >
    <Text py="1rem">{t`You’ll stop receiving this alert from now on. Depending on your organization’s permissions you might need to ask a moderator to be re-added in the future.`}</Text>
    <Flex justify="flex-end" gap="0.75rem">
      <Button onClick={onClose}>{t`Cancel`}</Button>
      <Button
        variant="filled"
        color="error"
        onClick={onConfirm}
      >{t`Unsubscribe`}</Button>
    </Flex>
  </Modal>
);
