import { t } from "ttag";
import _ from "underscore";

import { ConfirmModal } from "metabase/components/ConfirmModal";

export function CloseModal({
  onKeepEditing,
  onDiscardChanges,
}: {
  onKeepEditing?: () => void;
  onDiscardChanges?: () => void;
}) {
  return (
    <ConfirmModal
      opened
      data-ignore-editor-clicks="true"
      title={t`Keep editing your custom expression?`}
      content={t`You have changes that haven't been saved to your custom expression. You can continue editing it or discard the changes.`}
      message=""
      onConfirm={onDiscardChanges}
      onClose={onKeepEditing || _.noop}
      confirmButtonText={t`Discard changes`}
      confirmButtonPrimary
      closeButtonText={t`Keep editing`}
    />
  );
}
