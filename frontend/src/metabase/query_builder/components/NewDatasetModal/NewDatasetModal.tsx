import { useCallback } from "react";
import { t } from "ttag";

import ModelSVG from "assets/img/model-illustration.svg?component";
import { useUserAcknowledgement } from "metabase/current-user";
import { useDispatch } from "metabase/redux";
import { Box, Button, Modal } from "metabase/ui";

import { turnQuestionIntoModel } from "../../actions";

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
    <Modal
      opened
      size="md"
      layout="centered"
      illustration={<ModelSVG />}
      title={t`Models`}
      onClose={onClose}
    >
      <Box component="ul" ta="left">
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
      </Box>
      <Modal.Footer>
        <Button onClick={onClose} variant="subtle" color="neutral">
          {t`Cancel`}
        </Button>
        <Button variant="filled" onClick={onConfirm}>
          {t`Turn this into a model`}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
