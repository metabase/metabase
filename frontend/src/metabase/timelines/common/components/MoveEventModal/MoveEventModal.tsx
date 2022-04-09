import React, { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button/Button";
import { Timeline, TimelineEvent } from "metabase-types/api";
import ModalHeader from "../ModalHeader";
import ModalFooter from "../ModalFooter";
import TimelinePicker from "../TimelinePicker";
import { ModalRoot, ModalBody } from "./MoveEventModal.styled";
import { getSortedTimelines } from "metabase/lib/timelines";

export interface MoveEventModalProps {
  event: TimelineEvent;
  timelines: Timeline[];
  onSubmit: (
    event: TimelineEvent,
    newTimeline?: Timeline,
    oldTimeline?: Timeline,
  ) => void;
  onSubmitSuccess?: () => void;
  onCancel?: () => void;
  onClose?: () => void;
}

const MoveEventModal = ({
  event,
  timelines,
  onSubmit,
  onSubmitSuccess,
  onCancel,
  onClose,
}: MoveEventModalProps): JSX.Element => {
  const oldTimeline = timelines.find(t => t.id === event.timeline_id);
  const [newTimeline, setNewTimeline] = useState(oldTimeline);
  const isEnabled = newTimeline?.id !== oldTimeline?.id;

  const sortedTimelines = useMemo(() => {
    return getSortedTimelines(timelines);
  }, [timelines]);

  const handleSubmit = useCallback(async () => {
    await onSubmit(event, newTimeline, oldTimeline);
    onSubmitSuccess?.();
  }, [event, newTimeline, oldTimeline, onSubmit, onSubmitSuccess]);

  return (
    <ModalRoot>
      <ModalHeader title={t`Move ${event.name}`} onClose={onClose} />
      <ModalBody>
        <TimelinePicker
          value={newTimeline}
          options={sortedTimelines}
          onChange={setNewTimeline}
        />
      </ModalBody>
      <ModalFooter>
        <Button onClick={onCancel}>{t`Cancel`}</Button>
        <Button primary disabled={!isEnabled} onClick={handleSubmit}>
          {t`Move`}
        </Button>
      </ModalFooter>
    </ModalRoot>
  );
};

export default MoveEventModal;
