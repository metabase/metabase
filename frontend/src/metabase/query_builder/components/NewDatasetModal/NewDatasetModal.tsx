import { useCallback } from "react";
import { t } from "ttag";

import { ModalContent } from "metabase/common/components/ModalContent";
import { useUserAcknowledgement } from "metabase/common/hooks/use-user-acknowledgement";
import { useDispatch } from "metabase/lib/redux";
import { turnQuestionIntoModel } from "metabase/query_builder/actions";
import { Box, Button, Text } from "metabase/ui";

import NewDatasetModalS from "./NewDatasetModal.module.css";

export function NewDatasetModal({ onClose }: { onClose: () => void }) {
  const dispatch = useDispatch();

  const [, { ack }] = useUserAcknowledgement("turn_into_model_modal");

  const onConfirm = useCallback(() => {
    ack();
    dispatch(turnQuestionIntoModel());
    onClose();
  }, [dispatch, ack, onClose]);

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
        >{t`Turn this into a model`}</Button>,
      ]}
    >
      <Box p="2rem 1rem 0">
        <Box component="img" pt="md" src="app/img/model-illustration.svg" />
        <Text component="h2" mt="2rem" mb="md">{t`Models`}</Text>
        <ul>
          <li className={NewDatasetModalS.DatasetValueProp}>
            {t`Let you update column descriptions and customize metadata to create
            great starting points for exploration.`}
          </li>
          <li className={NewDatasetModalS.DatasetValueProp}>
            {t`Show up higher in search results and get highlighted when other
            users start new questions to promote reuse.`}
          </li>
          <li className={NewDatasetModalS.DatasetValueProp}>
            {t`Live in collections to keep them separate from messy database
            schemas.`}
          </li>
        </ul>
      </Box>
    </ModalContent>
  );
}
