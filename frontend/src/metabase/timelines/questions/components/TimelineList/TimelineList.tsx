import React from "react";
import { Timeline } from "metabase-types/api";
import TimelineCard from "metabase/timelines/questions/components/TimelineCard/TimelineCard";

export interface TimelineListProps {
  timelines: Timeline[];
  visibility: Record<number, boolean>;
  onToggleTimeline?: (timeline: Timeline, isVisible: boolean) => void;
}

const TimelineList = ({
  timelines,
  visibility,
  onToggleTimeline,
}: TimelineListProps): JSX.Element => {
  return (
    <div>
      {timelines.map(timeline => (
        <TimelineCard
          key={timeline.id}
          timeline={timeline}
          isVisible={visibility[timeline.id] ?? true}
          onToggleTimeline={onToggleTimeline}
        />
      ))}
    </div>
  );
};

export default TimelineList;
