import React, { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import { getSortedTimelines } from "metabase/lib/timelines";
import Button from "metabase/core/components/Button/Button";
import { Collection, Timeline, TimelineEvent } from "metabase-types/api";
import ModalHeader from "../ModalHeader";
import ModalFooter from "../ModalFooter";
import TimelinePicker from "../TimelinePicker";
import { ModalRoot, ModalBody } from "./MoveEventModal.styled";

export interface MoveEventModalProps {
  event: TimelineEvent;
  timelines: Timeline[];
  collection?: Collection;
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
  collection,
  onSubmit,
  onSubmitSuccess,
  onCancel,
  onClose,
}: MoveEventModalProps): JSX.Element => {
  const oldTimeline = timelines.find(t => t.id === event.timeline_id);
  const [newTimeline, setNewTimeline] = useState(oldTimeline);
  const isEnabled = newTimeline?.id !== oldTimeline?.id;

  const sortedTimelines = useMemo(() => {
    return getSortedTimelines(timelines, collection);
  }, [timelines, collection]);

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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MoveEventModal;
