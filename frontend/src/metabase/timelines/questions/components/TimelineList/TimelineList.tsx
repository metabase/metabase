import React from "react";
import { Collection, Timeline, TimelineEvent } from "metabase-types/api";
import TimelineCard from "metabase/timelines/questions/components/TimelineCard/TimelineCard";

export interface TimelineListProps {
  timelines: Timeline[];
  collection: Collection;
  selectedEventIds?: number[];
  visibleTimelineIds?: number[];
  onEditEvent?: (event: TimelineEvent) => void;
  onArchiveEvent?: (event: TimelineEvent) => void;
  onToggleTimeline?: (timeline: Timeline, isVisible: boolean) => void;
}

const TimelineList = ({
  timelines,
  collection,
  selectedEventIds = [],
  visibleTimelineIds = [],
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
          collection={collection}
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
