import React, { useCallback } from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button";
import ModalHeader from "metabase/timelines/common/components/ModalHeader";
import ModalFooter from "metabase/timelines/common/components/ModalFooter";
import { Timeline, TimelineEvent } from "metabase-types/api";

export interface DeleteEventModalProps {
  event: TimelineEvent;
  timeline: Timeline;
  onSubmit: (event: TimelineEvent, timeline: Timeline) => void;
  onCancel: () => void;
  onClose?: () => void;
}

const DeleteEventModal = ({
  event,
  timeline,
  onSubmit,
  onCancel,
  onClose,
}: DeleteEventModalProps): JSX.Element => {
  const handleSubmit = useCallback(async () => {
    await onSubmit(event, timeline);
  }, [event, timeline, onSubmit]);

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
