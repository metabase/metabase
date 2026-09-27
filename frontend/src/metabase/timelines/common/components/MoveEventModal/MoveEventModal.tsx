import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { getSortedTimelines } from "metabase/common/utils/timelines";
import { Button, Flex } from "metabase/ui";
import type { Collection, Timeline, TimelineEvent } from "metabase-types/api";

import ModalFooter from "../ModalFooter";
import ModalHeader from "../ModalHeader";
import TimelinePicker from "../TimelinePicker";

import S from "./MoveEventModal.module.css";

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
  onClose?: () => void;
}

const MoveEventModal = ({
  event,
  timelines,
  collection,
  onSubmit,
  onSubmitSuccess,
  onClose,
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
    <Flex direction="column" mih={573} mah="90vh">
      <ModalHeader title={t`Move ${event.name}`} onClose={onClose} />
      <Flex
        className={S.body}
        direction="column"
        flex="1 1 auto"
        my="lg"
        py="lg"
        px="xxl"
      >
        <TimelinePicker
          value={newTimeline}
          options={sortedTimelines}
          onChange={setNewTimeline}
        />
      </Flex>
      <ModalFooter>
        <Button onClick={onClose}>{t`Cancel`}</Button>
        <Button variant="filled" disabled={!isEnabled} onClick={handleSubmit}>
          {t`Move`}
        </Button>
      </ModalFooter>
    </Flex>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MoveEventModal;
