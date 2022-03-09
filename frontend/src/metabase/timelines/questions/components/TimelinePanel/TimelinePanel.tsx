import React from "react";
import { Timeline } from "metabase-types/api";
import TimelineCard from "../TimelineCard";
import { PanelRoot } from "./TimelinePanel.styled";

export interface TimelinePanelProps {
  timelines: Timeline[];
  timelineVisibility?: Record<number, boolean>;
  isVisibleByDefault?: boolean;
  onShowTimeline?: (timeline: Timeline) => void;
  onHideTimeline?: (timeline: Timeline) => void;
}

const TimelinePanel = ({
  timelines,
  timelineVisibility = {},
  isVisibleByDefault = false,
  onShowTimeline,
  onHideTimeline,
}: TimelinePanelProps): JSX.Element => {
  return (
    <PanelRoot>
      {timelines.map(timeline => (
        <TimelineCard
          key={timeline.id}
          timeline={timeline}
          isVisible={timelineVisibility[timeline.id] ?? isVisibleByDefault}
          onShowTimeline={onShowTimeline}
          onHideTimeline={onHideTimeline}
        />
      ))}
    </PanelRoot>
  );
};

export default TimelinePanel;
