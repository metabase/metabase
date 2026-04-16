import { useCallback } from "react";
import { t } from "ttag";

import { Button } from "metabase/common/components/Button";
import type { Timeline, TimelineEvent } from "metabase-types/api";

import ModalFooter from "../ModalFooter";
import ModalHeader from "../ModalHeader";

export interface DeleteEventModalProps {
  event: TimelineEvent;
  timeline: Timeline;
  onSubmit: (event: TimelineEvent, timeline: Timeline) => void;
  onSubmitSuccess?: () => void;
  onClose?: () => void;
}

const DeleteEventModal = ({
  event,
  timeline,
  onSubmit,
  onSubmitSuccess,
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
        <Button onClick={onClose}>{t`Cancel`}</Button>
        <Button danger onClick={handleSubmit}>{t`Delete`}</Button>
      </ModalFooter>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DeleteEventModal;
