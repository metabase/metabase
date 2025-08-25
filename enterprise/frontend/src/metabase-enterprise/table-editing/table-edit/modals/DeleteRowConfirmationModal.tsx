import { t } from "ttag";

import { Button, Group, Modal } from "metabase/ui";

type DeleteRowConfirmationModalProps = {
  isLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};
export function DeleteRowConfirmationModal({
  onConfirm,
  onCancel,
  isLoading,
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
          loading={isLoading}
        >
          {t`Delete record`}
        </Button>
      </Group>
    </Modal>
  );
}
