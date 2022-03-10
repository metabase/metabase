import React from "react";
import { Timeline } from "metabase-types/api";
import TimelineCard from "../TimelineCard";
import { PanelRoot } from "./TimelinePanel.styled";

export interface TimelinePanelProps {
  timelines: Timeline[];
  visibility: Record<number, boolean>;
  onToggleTimeline?: (timeline: Timeline, isVisible: boolean) => void;
}

const TimelinePanel = ({
  timelines,
  visibility,
  onToggleTimeline,
}: TimelinePanelProps): JSX.Element => {
  return (
    <PanelRoot>
      {timelines.map(timeline => (
        <TimelineCard
          key={timeline.id}
          timeline={timeline}
          isVisible={visibility[timeline.id] ?? true}
          onToggleTimeline={onToggleTimeline}
        />
      ))}
    </PanelRoot>
  );
};

export default TimelinePanel;
