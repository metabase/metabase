import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { getSortedTimelines } from "metabase/common/utils/timelines";
import { Button, Modal } from "metabase/ui";
import type { Collection, Timeline, TimelineEvent } from "metabase-types/api";

import { TimelineModalScrollArea } from "../TimelineModal";
import { TimelinePicker } from "../TimelinePicker";

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
  onCancel: () => void;
}

export const MoveEventModal = ({
  event,
  timelines,
  collection,
  onSubmit,
  onSubmitSuccess,
  onCancel,
}: MoveEventModalProps): JSX.Element => {
  const oldTimeline = timelines.find((t) => t.id === event.timeline_id);
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
    <>
      <TimelineModalScrollArea>
        <TimelinePicker
          value={newTimeline}
          options={sortedTimelines}
          onChange={setNewTimeline}
        />
      </TimelineModalScrollArea>
      <Modal.Footer>
        <Button onClick={onCancel}>{t`Cancel`}</Button>
        <Button variant="filled" disabled={!isEnabled} onClick={handleSubmit}>
          {t`Move`}
        </Button>
      </Modal.Footer>
    </>
  );
};
