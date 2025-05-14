import { msgid, ngettext, t } from "ttag";

import { Button, Group, Modal, Stack, Text } from "metabase/ui";

type DeleteBulkRowConfirmationModalProps = {
  opened: boolean;
  rowCount: number;
  isLoading: boolean;
  onConfirm: () => void;
  onClose: () => void;
};
export function DeleteBulkRowConfirmationModal({
  opened,
  rowCount,
  isLoading,
  onConfirm,
  onClose,
}: DeleteBulkRowConfirmationModalProps) {
  return (
    <Modal
      size="md"
      title={ngettext(
        msgid`Delete ${rowCount} record?`,
        `Delete ${rowCount} records?`,
        rowCount,
      )}
      opened={opened}
      onClose={onClose}
    >
      <Stack>
        <Text>{t`This action can not be undone.`}</Text>
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            {t`Cancel`}
          </Button>
          <Button
            variant="filled"
            color="danger"
            onClick={onConfirm}
            loading={isLoading}
          >
            {ngettext(
              msgid`Delete ${rowCount} record`,
              `Delete ${rowCount} records`,
              rowCount,
            )}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
