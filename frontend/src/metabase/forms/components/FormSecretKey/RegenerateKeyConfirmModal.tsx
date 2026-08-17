import { t } from "ttag";

import { Button, Group, Modal, Stack, Text } from "metabase/ui";

type RegenerateKeyConfirmModalProps = {
  onConfirm: () => void;
  onClose: () => void;
};

export const RegenerateKeyConfirmModal = ({
  onConfirm,
  onClose,
}: RegenerateKeyConfirmModalProps) => (
  <Modal opened onClose={onClose} title={t`Delete key and generate a new one?`}>
    <Stack gap="lg">
      <Text c="text-secondary">
        {t`This will cause existing tokens to stop working until the identity provider is updated with a new key.`}
      </Text>

      <Group justify="flex-end" gap="sm">
        <Button onClick={onClose}>{t`No, don't delete`}</Button>
        <Button onClick={onConfirm} variant="filled" color="feedback-negative">
          {t`Delete key`}
        </Button>
      </Group>
    </Stack>
  </Modal>
);
