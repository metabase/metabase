import { t } from "ttag";

import { useDeleteTableIndexMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { useToast } from "metabase/common/hooks";
import type { Index } from "metabase-types/api";

type DeleteIndexModalProps = {
  index: Index;
  onClose: () => void;
};

export function DeleteIndexModal({ index, onClose }: DeleteIndexModalProps) {
  const [sendToast] = useToast();
  const [deleteIndex] = useDeleteTableIndexMutation();

  const request = index.request;
  if (request == null) {
    return null;
  }

  const handleConfirm = async () => {
    try {
      await deleteIndex(request.id).unwrap();
      onClose();
    } catch (error) {
      sendToast({
        message: getErrorMessage(error, t`Failed to delete index`),
        icon: "warning",
      });
    }
  };

  const message = index.name
    ? t`Are you sure you want to delete the index ${index.name}?`
    : t`Are you sure you want to delete this index?`;

  return (
    <ConfirmModal
      opened
      title={t`Delete index?`}
      message={message}
      confirmButtonText={t`Delete`}
      onConfirm={handleConfirm}
      onClose={onClose}
    />
  );
}
