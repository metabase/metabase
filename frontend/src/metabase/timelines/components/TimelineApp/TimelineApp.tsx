import React from "react";
import { TimelineMode } from "metabase-types/store";
import NewEventModal from "../../containers/NewEventModal";
import NewTimelineModal from "../../containers/NewTimelineModal";
import TimelineListModal from "../../containers/TimelineListModal";
import TimelineModal from "../../containers/TimelineModal";

export interface TimelineAppProps {
  mode: TimelineMode;
}

const TimelineApp = ({ mode }: TimelineAppProps): JSX.Element | null => {
  switch (mode) {
    case "timeline-view":
      return <TimelineModal />;
    case "timeline-list":
      return <TimelineListModal />;
    case "timeline-new":
      return <NewTimelineModal />;
    case "timeline-event-new":
      return <NewEventModal />;
    default:
      return null;
  }
};

export default TimelineApp;
