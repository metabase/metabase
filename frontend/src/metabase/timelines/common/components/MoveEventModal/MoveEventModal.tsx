import React, { useCallback, useState } from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button/Button";
import { Timeline, TimelineEvent } from "metabase-types/api";
import ModalHeader from "../ModalHeader";
import ModalFooter from "../ModalFooter";
import TimelinePicker from "../TimelinePicker";
import { ModalRoot, ModalBody } from "./MoveEventModal.styled";

export interface MoveEventModalProps {
  event: TimelineEvent;
  timelines: Timeline[];
  onSubmit: (
    event: TimelineEvent,
    newTimeline?: Timeline,
    oldTimeline?: Timeline,
    onClose?: () => void,
  ) => void;
  onCancel?: () => void;
  onClose?: () => void;
}

const MoveEventModal = ({
  event,
  timelines,
  onSubmit,
  onCancel,
  onClose,
}: MoveEventModalProps): JSX.Element => {
  const oldTimeline = timelines.find(t => t.id === event.timeline_id);
  const [newTimeline, setNewTimeline] = useState(oldTimeline);
  const hasChanged = newTimeline?.id !== oldTimeline?.id;

  const handleSubmit = useCallback(async () => {
    await onSubmit(event, newTimeline, oldTimeline, onClose);
  }, [event, newTimeline, oldTimeline, onSubmit, onClose]);

  return (
    <ModalRoot>
      <ModalHeader title={t`Move ${event.name}`} onClose={onClose} />
      <ModalBody>
        <TimelinePicker
          value={newTimeline}
          options={timelines}
          onChange={setNewTimeline}
        />
      </ModalBody>
      <ModalFooter>
        <Button onClick={onCancel ?? onClose}>{t`Cancel`}</Button>
        <Button primary disabled={!hasChanged} onClick={handleSubmit}>
          {t`Move`}
        </Button>
      </ModalFooter>
    </ModalRoot>
  );
};

export default MoveEventModal;
