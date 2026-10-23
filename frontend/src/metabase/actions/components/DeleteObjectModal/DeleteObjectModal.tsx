import type { FunctionComponent } from "react";
import { t } from "ttag";

import { getActionErrorMessage } from "metabase/actions/utils";
import { useExecuteActionMutation } from "metabase/api";
import { useToast } from "metabase/common/hooks/use-toast";
import { Button, Modal, Text } from "metabase/ui";
import type { WritebackActionId } from "metabase-types/api";

interface Props {
  opened: boolean;
  actionId: WritebackActionId | undefined;
  objectId: number | string | null | undefined;
  onClose: () => void;
  onSuccess: () => void;
}

export const DeleteObjectModal: FunctionComponent<Props> = ({
  opened,
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
      sendToast({ message, toastColor: "feedback-positive" });
      onClose();
      onSuccess();
    } catch (error) {
      const message = getActionErrorMessage(error);
      sendToast({ variant: "negative", message });
    }
  };

  return (
    <Modal
      opened={opened}
      data-testid="delete-object-modal"
      size="lg"
      title={t`Are you sure you want to delete this row?`}
      onClose={onClose}
    >
      <Text>{t`This will permanently delete the row. There’s no undoing this, so please be sure.`}</Text>
      <Modal.Footer>
        <Button onClick={onClose}>{t`Cancel`}</Button>
        <Button
          variant="filled"
          color="negative"
          disabled={
            typeof actionId === "undefined" ||
            typeof objectId === "undefined" ||
            objectId === null
          }
          onClick={handleSubmit}
        >{t`Delete forever`}</Button>
      </Modal.Footer>
    </Modal>
  );
};
