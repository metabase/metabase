import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { getSortedTimelines } from "metabase/common/utils/timelines";
import {
  type TimelineModalTransitionProps,
  getTimelineModalTransitionProps,
} from "metabase/timelines/common/modal-transitions";
import { Box, Button, Modal } from "metabase/ui";
import type { Collection, Timeline, TimelineEvent } from "metabase-types/api";

import S from "../TimelineModal.module.css";
import { TimelinePicker } from "../TimelinePicker";

export interface MoveEventModalProps extends TimelineModalTransitionProps {
  event: TimelineEvent;
  timelines: Timeline[];
  collection?: Collection;
  onSubmit: (
    event: TimelineEvent,
    newTimeline?: Timeline,
    oldTimeline?: Timeline,
  ) => void;
  onSubmitSuccess?: () => void;
  onClose: () => void;
}

export const MoveEventModal = ({
  event,
  timelines,
  collection,
  onSubmit,
  onSubmitSuccess,
  onClose,
  animated,
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
    <Modal
      opened
      size="lg"
      title={t`Move ${event.name}`}
      classNames={{ content: S.content, body: S.body }}
      onClose={onClose}
      {...getTimelineModalTransitionProps(animated)}
    >
      <Box className={S.scrollArea}>
        <TimelinePicker
          value={newTimeline}
          options={sortedTimelines}
          onChange={setNewTimeline}
        />
      </Box>
      <Modal.Footer>
        <Button onClick={onClose}>{t`Cancel`}</Button>
        <Button variant="filled" disabled={!isEnabled} onClick={handleSubmit}>
          {t`Move`}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
