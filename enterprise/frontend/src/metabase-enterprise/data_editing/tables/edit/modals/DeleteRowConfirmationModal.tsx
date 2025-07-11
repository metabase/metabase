import { t } from "ttag";

import { Button, Group, Modal } from "metabase/ui";

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
      <Group justify="flex-end" mt="xl">
        <Button variant="subtle" onClick={onCancel}>
          {t`Cancel`}
        </Button>
        <Button
          variant="filled"
          color="danger"
          onClick={onConfirm}
        >{t`Delete record`}</Button>
      </Group>
    </Modal>
  );
}
