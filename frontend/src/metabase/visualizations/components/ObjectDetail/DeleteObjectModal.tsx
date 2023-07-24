import { FunctionComponent } from "react";
import { t } from "ttag";

import { WritebackActionId } from "metabase-types/api";
import {
  getActionErrorMessage,
  getActionExecutionMessage,
} from "metabase/actions/utils";
import { useActionQuery } from "metabase/common/hooks";
import ModalContent from "metabase/components/ModalContent";
import Button from "metabase/core/components/Button";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import { ActionsApi } from "metabase/services";

import { ObjectId } from "./types";

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
  const dispatch = useDispatch();

  const { data: action } = useActionQuery({
    enabled: typeof actionId === "number",
    id: actionId,
  });

  const handleSubmit = async () => {
    if (!action || objectId === null || typeof objectId === "undefined") {
      return;
    }

    const parameters = { id: objectId };

    try {
      const result = await ActionsApi.execute({
        id: action.id,
        parameters,
      });

      const message = getActionExecutionMessage(action, result);
      dispatch(addUndo({ message, toastColor: "success" }));
      onClose();
      onSuccess();
    } catch (error) {
      const message = getActionErrorMessage(error);
      dispatch(addUndo({ icon: "warning", toastColor: "error", message }));
    }
  };

  return (
    <ModalContent
      title={t`Are you sure you want to delete this row?`}
      footer={[
        <Button key="cancel" onClick={onClose}>{t`Cancel`}</Button>,
        <Button
          key="delete"
          danger
          disabled={!action}
          onClick={handleSubmit}
        >{t`Delete forever`}</Button>,
      ]}
      onClose={onClose}
    >
      {t`This will permanently delete the row. There’s no undoing this, so please be sure.`}
    </ModalContent>
  );
};
