import type { FunctionComponent } from "react";
import { t } from "ttag";

import { getActionErrorMessage } from "metabase/actions/utils";
import { Button } from "metabase/common/components/Button";
import { ModalContent } from "metabase/common/components/ModalContent";
import { useToast } from "metabase/common/hooks/use-toast";
import { ActionsApi } from "metabase/services";
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

  const handleSubmit = async () => {
    try {
      await ActionsApi.execute({
        id: actionId,
        parameters: {
          id: typeof objectId === "string" ? parseInt(objectId, 10) : objectId,
        },
      });

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
          danger
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
