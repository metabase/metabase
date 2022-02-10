import React from "react";
import { Timeline } from "metabase-types/api";
import ModalHeader from "../ModalHeader";

export interface TimelineModalProps {
  timeline: Timeline;
  onClose: () => void;
}

const TimelineModal = ({
  timeline,
  onClose,
}: TimelineModalProps): JSX.Element => {
  return (
    <div>
      <ModalHeader title={timeline.name} onClose={onClose} />
    </div>
  );
};

export default TimelineModal;
