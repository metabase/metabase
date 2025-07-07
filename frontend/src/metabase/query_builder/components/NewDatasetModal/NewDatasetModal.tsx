import { useCallback } from "react";
import { t } from "ttag";

import ModalContent from "metabase/common/components/ModalContent";
import { useUserAcknowledgement } from "metabase/common/hooks/use-user-acknowledgement";
import { useDispatch } from "metabase/lib/redux";
import { turnQuestionIntoModel } from "metabase/query_builder/actions";
import { Box, Button, Text } from "metabase/ui";

import NewDatasetModalS from "./NewDatasetModal.module.css";

export function NewDatasetModal({ onClose }: { onClose: () => void }) {
  const dispatch = useDispatch();

  const [, { ack }] = useUserAcknowledgement("turn_into_model_modal");

  const onConfirm = useCallback(() => {
    //ack();
    dispatch(turnQuestionIntoModel());
    onClose();
  }, [dispatch, onClose]);

  return (
    <ModalContent
      footer={[
        <Button
          key="cancel"
          onClick={onClose}
          variant="subtle"
        >{t`Cancel`}</Button>,
        <Button
          key="action"
          variant="filled"
          onClick={onConfirm}
        >{t`Turn this into a transform`}</Button>,
      ]}
    >
    </ModalContent>
  );
}
