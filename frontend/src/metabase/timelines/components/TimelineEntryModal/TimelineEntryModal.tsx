import React from "react";
import { Timeline } from "metabase-types/api";
import TimelineDetailsModal from "../../containers/TimelineDetailsModal";
import TimelineListModal from "../../containers/TimelineListModal";
import { ModalParams } from "../../types";

export interface TimelineEntryModalProps {
  timelines: Timeline[];
  params: ModalParams;
  onClose?: () => void;
}

const TimelineEntryModal = ({
  timelines,
  params,
  onClose,
}: TimelineEntryModalProps): JSX.Element => {
  if (timelines.length === 1) {
    const newParams = { ...params, timelineId: timelines[0].id };
    return <TimelineDetailsModal params={newParams} onClose={onClose} />;
  } else {
    return <TimelineListModal params={params} onClose={onClose} />;
  }
};

export default TimelineEntryModal;
