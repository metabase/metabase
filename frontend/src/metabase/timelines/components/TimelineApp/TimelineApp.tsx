import React from "react";
import { TimelineMode } from "metabase-types/store";
import NewEventModal from "../../containers/NewEventModal";
import NewTimelineModal from "../../containers/NewTimelineModal";
import TimelineListModal from "../../containers/TimelineListModal";
import TimelineModal from "../../containers/TimelineModal";
import NewEventWithTimelineModal from "../../containers/NewEventWithTimelineModal";

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
    case "timeline-event-new-default":
      return <NewEventWithTimelineModal />;
    default:
      return null;
  }
};

export default TimelineApp;
