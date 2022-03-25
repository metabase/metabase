import React from "react";
import { Timeline, TimelineEvent } from "metabase-types/api";
import TimelineCard from "metabase/timelines/questions/components/TimelineCard/TimelineCard";

export interface TimelineListProps {
  timelines: Timeline[];
  visibleTimelineIds?: number[];
  selectedEventIds?: number[];
  onEditEvent?: (event: TimelineEvent) => void;
  onArchiveEvent?: (event: TimelineEvent) => void;
  onToggleTimeline?: (timeline: Timeline, isVisible: boolean) => void;
}

const TimelineList = ({
  timelines,
  visibleTimelineIds = [],
  selectedEventIds = [],
  onEditEvent,
  onArchiveEvent,
  onToggleTimeline,
}: TimelineListProps): JSX.Element => {
  return (
    <div>
      {timelines.map(timeline => (
        <TimelineCard
          key={timeline.id}
          timeline={timeline}
          isDefault={timelines.length === 1}
          isVisible={visibleTimelineIds.includes(timeline.id)}
          selectedEventIds={selectedEventIds}
          onToggleTimeline={onToggleTimeline}
          onEditEvent={onEditEvent}
          onArchiveEvent={onArchiveEvent}
        />
      ))}
    </div>
  );
};

export default TimelineList;
