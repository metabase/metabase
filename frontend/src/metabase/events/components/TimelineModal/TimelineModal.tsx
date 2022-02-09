import React from "react";
import { EventTimeline } from "metabase-types/api";
import ModalHeader from "../ModalHeader";

export interface TimelineModalProps {
  timeline: EventTimeline;
}

const TimelineModal = ({ timeline }: TimelineModalProps): JSX.Element => {
  return (
    <div>
      <ModalHeader title={timeline.name} />
    </div>
  );
};

export default TimelineModal;
