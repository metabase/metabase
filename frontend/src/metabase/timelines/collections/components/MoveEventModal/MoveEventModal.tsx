import React, { useCallback, useState } from "react";
import { t } from "ttag";
import ModalHeader from "metabase/timelines/common/components/ModalHeader";
import ModalFooter from "metabase/timelines/common/components/ModalFooter";
import { Timeline, TimelineEvent } from "metabase-types/api";
import { ModalRoot, ModalBody } from "./MoveEventModal.styled";
import Button from "metabase/core/components/Button/Button";
import TimelinePicker from "metabase/timelines/common/components/TimelinePicker";

export interface MoveEventModalProps {
  event: TimelineEvent;
  timeline: Timeline;
  timelines: Timeline[];
  onSubmit: (event: TimelineEvent, timeline: Timeline) => void;
  onCancel: () => void;
  onClose?: () => void;
}

const MoveEventModal = ({
  event,
  timeline,
  timelines,
  onSubmit,
  onCancel,
  onClose,
}: MoveEventModalProps): JSX.Element => {
  const [selection, setSelection] = useState(timeline);

  const handleSubmit = useCallback(() => {
    onSubmit(event, selection);
  }, [event, selection, onSubmit]);

  return (
    <ModalRoot>
      <ModalHeader title={t`Move ${event.name}`} onClose={onClose} />
      <ModalBody>
        <TimelinePicker
          value={selection}
          options={timelines}
          onChange={setSelection}
        />
      </ModalBody>
      <ModalFooter>
        <Button onClick={onCancel}>{t`Cancel`}</Button>
        <Button primary onClick={handleSubmit}>{t`Move`}</Button>
      </ModalFooter>
    </ModalRoot>
  );
};

export default MoveEventModal;
