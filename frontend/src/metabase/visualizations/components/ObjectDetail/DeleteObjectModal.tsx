import { FunctionComponent } from "react";
import { t } from "ttag";

import { WritebackActionId } from "metabase-types/api";
import { executeAction } from "metabase/actions/actions";
import { useActionQuery } from "metabase/common/hooks";
import ModalContent from "metabase/components/ModalContent";
import Button from "metabase/core/components/Button";
import { useDispatch } from "metabase/lib/redux";

interface Props {
  actionId: WritebackActionId | undefined;
  onClose: () => void;
}

export const DeleteObjectModal: FunctionComponent<Props> = ({
  actionId,
  onClose,
}) => {
  const dispatch = useDispatch();

  const { data: action } = useActionQuery({
    enabled: typeof actionId === "number",
    id: actionId,
  });

  const handleSubmit = () => {
    dispatch(executeAction({ action, parameters }));
  };

  return (
    <ModalContent
      title={t`Are you sure you want to delete this row?`}
      footer={[
        <Button key="cancel" onClick={onClose}>{t`Cancel`}</Button>,
        <Button
          key="delete"
          danger
          onClick={handleSubmit}
        >{t`Delete forever`}</Button>,
      ]}
      onClose={onClose}
    >
      {t`This will permanantly delete the row. There’s no undoing this, so please be sure.`}
    </ModalContent>
  );
};
