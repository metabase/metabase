import React, { useCallback } from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button";
import { Timeline, TimelineEvent } from "metabase-types/api";
import ModalHeader from "../ModalHeader";
import ModalFooter from "../ModalFooter";

export interface DeleteEventModalProps {
  event: TimelineEvent;
  timeline: Timeline;
  onSubmit: (event: TimelineEvent, timeline: Timeline) => void;
  onSubmitSuccess?: () => void;
  onCancel?: () => void;
  onClose?: () => void;
}

const DeleteEventModal = ({
  event,
  timeline,
  onSubmit,
  onSubmitSuccess,
  onCancel,
  onClose,
}: DeleteEventModalProps): JSX.Element => {
  const handleSubmit = useCallback(async () => {
    await onSubmit(event, timeline);
    onSubmitSuccess?.();
  }, [event, timeline, onSubmit, onSubmitSuccess]);

  return (
    <div>
      <ModalHeader title={t`Delete ${event?.name}?`} onClose={onClose} />
      <ModalFooter hasPadding>
        <Button onClick={onCancel}>{t`Cancel`}</Button>
        <Button danger onClick={handleSubmit}>{t`Delete`}</Button>
      </ModalFooter>
    </div>
  );
};

export default DeleteEventModal;
