import type { FunctionComponent } from "react";
import { t } from "ttag";

import { getActionErrorMessage } from "metabase/actions/utils";
import { useExecuteActionMutation } from "metabase/api";
import { ModalContent } from "metabase/common/components/ModalContent";
import { useToast } from "metabase/common/hooks/use-toast";
import { Button } from "metabase/ui";
import type { WritebackActionId } from "metabase-types/api";

import type { ObjectId } from "./types";

interface Props {
  actionId: WritebackActionId | undefined;
  objectId: ObjectId | undefined;
  onClose: () => void;
  onSuccess: () => void;
}

export const DeleteObjectModal: FunctionComponent<Props> = ({
  actionId,
  objectId,
  onClose,
  onSuccess,
}) => {
  const [sendToast] = useToast();
  const [executeAction] = useExecuteActionMutation();

  const handleSubmit = async () => {
    if (actionId == null) {
      return;
    }

    try {
      await executeAction({
        id: actionId,
        parameters: {
          id:
            typeof objectId === "string"
              ? parseInt(objectId, 10)
              : (objectId ?? null),
        },
      }).unwrap();

      const message = t`Successfully deleted`;
      sendToast({ message, toastColor: "success" });
      onClose();
      onSuccess();
    } catch (error) {
      const message = getActionErrorMessage(error);
      sendToast({ icon: "warning", toastColor: "error", message });
    }
  };

  return (
    <ModalContent
      data-testid="delete-object-modal"
      title={t`Are you sure you want to delete this row?`}
      footer={[
        <Button key="cancel" onClick={onClose}>{t`Cancel`}</Button>,
        <Button
          key="delete"
          variant="filled"
          color="error"
          disabled={
            typeof actionId === "undefined" ||
            typeof objectId === "undefined" ||
            objectId === null
          }
          onClick={handleSubmit}
        >{t`Delete forever`}</Button>,
      ]}
      onClose={onClose}
    >
      {t`This will permanently delete the row. There’s no undoing this, so please be sure.`}
    </ModalContent>
  );
};
