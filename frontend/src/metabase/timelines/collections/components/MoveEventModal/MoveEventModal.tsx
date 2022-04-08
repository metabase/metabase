import React, { useCallback, useState } from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button/Button";
import ModalHeader from "metabase/timelines/common/components/ModalHeader";
import ModalFooter from "metabase/timelines/common/components/ModalFooter";
import TimelinePicker from "metabase/timelines/common/components/TimelinePicker";
import { Timeline, TimelineEvent } from "metabase-types/api";
import { ModalRoot, ModalBody } from "./MoveEventModal.styled";

export interface MoveEventModalProps {
  event: TimelineEvent;
  timeline: Timeline;
  timelines: Timeline[];
  onSubmit: (
    event: TimelineEvent,
    newTimeline: Timeline,
    oldTimeline: Timeline,
  ) => void;
  onCancel: () => void;
  onClose?: () => void;
}

const MoveEventModal = ({
  event,
  timeline: oldTimeline,
  timelines,
  onSubmit,
  onCancel,
  onClose,
}: MoveEventModalProps): JSX.Element => {
  const [newTimeline, setNewTimeline] = useState(oldTimeline);
  const hasChanged = newTimeline.id !== oldTimeline.id;

  const handleSubmit = useCallback(async () => {
    await onSubmit(event, newTimeline, oldTimeline);
  }, [event, newTimeline, oldTimeline, onSubmit]);

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
        <Button onClick={onCancel}>{t`Cancel`}</Button>
        <Button primary disabled={!hasChanged} onClick={handleSubmit}>
          {t`Move`}
        </Button>
      </ModalFooter>
    </ModalRoot>
  );
};

export default MoveEventModal;
