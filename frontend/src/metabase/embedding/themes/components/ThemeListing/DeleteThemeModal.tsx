import { t } from "ttag";

import { Button, Modal, Text } from "metabase/ui";

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
      <Text>{t`Are you sure you want to delete this theme? This action cannot be undone.`}</Text>
      <Modal.Footer>
        <Button variant="subtle" color="neutral" onClick={onCancel}>
          {t`Cancel`}
        </Button>

        <Button variant="filled" color="negative" onClick={onDelete}>
          {t`Delete`}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
