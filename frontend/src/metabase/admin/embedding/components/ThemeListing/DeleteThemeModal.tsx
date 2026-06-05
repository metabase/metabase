import { t } from "ttag";

import { Button, Flex, Modal, Stack, Text } from "metabase/ui";

interface DeleteThemeModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onDelete: () => void;
}

export function DeleteThemeModal({
  isOpen,
  onCancel,
  onDelete,
}: DeleteThemeModalProps) {
  return (
    <Modal opened={isOpen} onClose={onCancel} title={t`Delete theme`}>
      <Stack>
        <Text>{t`Are you sure you want to delete this theme? This action cannot be undone.`}</Text>

        <Flex justify="flex-end" gap="md">
          <Button variant="subtle" onClick={onCancel}>
            {t`Cancel`}
          </Button>

          <Button variant="filled" color="error" onClick={onDelete}>
            {t`Delete`}
          </Button>
        </Flex>
      </Stack>
    </Modal>
  );
}
