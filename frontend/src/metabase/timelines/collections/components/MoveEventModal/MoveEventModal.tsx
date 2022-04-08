import React from "react";
import { t } from "ttag";
import ModalHeader from "metabase/timelines/common/components/ModalHeader";
import { Timeline, TimelineEvent } from "metabase-types/api";

export interface MoveEventModalProps {
  event: TimelineEvent;
  timeline: Timeline;
  onSubmit: (event: TimelineEvent, timeline: Timeline) => void;
  onCancel: () => void;
  onClose?: () => void;
}

const MoveEventModal = ({
  event,
  onClose,
}: MoveEventModalProps): JSX.Element => {
  return (
    <div>
      <ModalHeader title={t`Move ${event.name}`} onClose={onClose} />
    </div>
  );
};

export default MoveEventModal;
