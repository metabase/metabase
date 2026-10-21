import { msgid, ngettext, t } from "ttag";

import { Button, Modal } from "metabase/ui";

type DeleteBulkRowConfirmationModalProps = {
  opened: boolean;
  rowCount: number;
  isLoading?: boolean;
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
      <Modal.Footer>
        <Button variant="subtle" color="neutral" onClick={onClose}>
          {t`Cancel`}
        </Button>
        <Button
          variant="filled"
          color="negative"
          onClick={onConfirm}
          loading={isLoading}
        >
          {ngettext(
            msgid`Delete ${rowCount} record`,
            `Delete ${rowCount} records`,
            rowCount,
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
