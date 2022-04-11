import React, { useCallback } from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button/Button";
import { Timeline } from "metabase-types/api";
import ModalHeader from "../ModalHeader";
import ModalFooter from "../ModalFooter";

export interface DeleteTimelineModalProps {
  timeline: Timeline;
  onSubmit: (timeline: Timeline) => void;
  onSubmitSuccess?: () => void;
  onCancel?: () => void;
  onClose?: () => void;
}

const DeleteTimelineModal = ({
  timeline,
  onSubmit,
  onSubmitSuccess,
  onCancel,
  onClose,
}: DeleteTimelineModalProps): JSX.Element => {
  const handleSubmit = useCallback(async () => {
    await onSubmit(timeline);
    onSubmitSuccess?.();
  }, [timeline, onSubmit, onSubmitSuccess]);

  return (
    <div>
      <ModalHeader title={t`Delete ${timeline?.name}?`} onClose={onClose} />
      <ModalFooter hasPadding>
        <Button onClick={onCancel}>{t`Cancel`}</Button>
        <Button danger onClick={handleSubmit}>{t`Delete`}</Button>
      </ModalFooter>
    </div>
  );
};

export default DeleteTimelineModal;
