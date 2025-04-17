import { t } from "ttag";

import { Button, Group, Modal, Stack, Text } from "metabase/ui";

type DeleteRowConfirmationModalProps = {
  onConfirm: () => void;
  onCancel: () => void;
};
export function DeleteRowConfirmationModal({
  onConfirm,
  onCancel,
}: DeleteRowConfirmationModalProps) {
  return (
    <Modal size="md" title={t`Delete this record?`} opened onClose={onCancel}>
      <Stack>
        <Text>{t`This action can not be undone.`}</Text>
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onCancel}>
            {t`Cancel`}
          </Button>
          <Button
            variant="filled"
            color="danger"
            onClick={onConfirm}
          >{t`Delete record`}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
