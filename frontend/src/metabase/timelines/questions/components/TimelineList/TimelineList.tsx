import React from "react";
import { Timeline, TimelineEvent } from "metabase-types/api";
import TimelineCard from "metabase/timelines/questions/components/TimelineCard/TimelineCard";

export interface TimelineListProps {
  timelines: Timeline[];
  visibleTimelineIds?: number[];
  hiddenEventIds: number[];
  selectedEventIds?: number[];
  onEditEvent?: (event: TimelineEvent) => void;
  onMoveEvent?: (event: TimelineEvent) => void;
  onArchiveEvent?: (event: TimelineEvent) => void;
  onToggleEventSelected?: (event: TimelineEvent, isSelected: boolean) => void;
  onToggleEventVisibility: (event: TimelineEvent, isSelected: boolean) => void;
  onToggleTimeline?: (timeline: Timeline, isVisible: boolean) => void;
}

const TimelineList = ({
  timelines,
  visibleTimelineIds = [],
  hiddenEventIds,
  selectedEventIds = [],
  onEditEvent,
  onMoveEvent,
  onArchiveEvent,
  onToggleEventSelected,
  onToggleEventVisibility,
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
          hiddenEventIds={hiddenEventIds}
          selectedEventIds={selectedEventIds}
          onToggleTimeline={onToggleTimeline}
          onEditEvent={onEditEvent}
          onMoveEvent={onMoveEvent}
          onToggleEventSelected={onToggleEventSelected}
          onToggleEventVisibility={onToggleEventVisibility}
          onArchiveEvent={onArchiveEvent}
        />
      ))}
    </div>
  );
};

export default TimelineList;
