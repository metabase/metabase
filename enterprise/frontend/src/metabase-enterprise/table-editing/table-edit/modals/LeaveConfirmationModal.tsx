import { t } from "ttag";

import { Button, Group, Modal, Text } from "metabase/ui";

type LeaveConfirmationModalProps = {
  opened: boolean;
  onContinue: () => void;
  onLeave: () => void;
};

export function LeaveConfirmationModal({
  opened,
  onContinue,
  onLeave,
}: LeaveConfirmationModalProps) {
  return (
    <Modal title={t`Unsaved changes`} opened={opened} onClose={onLeave}>
      <Text>{t`You have unsaved changes. Are you sure you want to discard them?`}</Text>
      <Group justify="flex-end" mt="lg">
        <Button onClick={onContinue}>{t`Continue editing`}</Button>
        <Button variant="filled" color="error" onClick={onLeave}>
          {t`Discard changes`}
        </Button>
      </Group>
    </Modal>
  );
}
