import type { Timeline, TimelineEvent } from "metabase-types/api";

import { TimelineCard } from "../TimelineCard/TimelineCard";

export interface TimelineListProps {
  timelines: Timeline[];
  visibleEventIds: number[];
  partiallyVisibleEventIds?: number[];
  selectedEventIds?: number[];
  onEditEvent?: (event: TimelineEvent) => void;
  onMoveEvent?: (event: TimelineEvent) => void;
  onArchiveEvent?: (event: TimelineEvent) => void;
  onToggleEventSelected?: (event: TimelineEvent, isSelected: boolean) => void;
  onShowTimelineEvents: (timelineEvent: TimelineEvent[]) => void;
  onHideTimelineEvents: (timelineEvent: TimelineEvent[]) => void;
  onShowTimeline: (timeline: Timeline) => void;
  onHideTimeline: (timeline: Timeline) => void;
}

const TimelineList = ({
  timelines,
  visibleEventIds,
  partiallyVisibleEventIds,
  selectedEventIds = [],
  onEditEvent,
  onMoveEvent,
  onArchiveEvent,
  onToggleEventSelected,
  onShowTimelineEvents,
  onHideTimelineEvents,
  onShowTimeline,
  onHideTimeline,
}: TimelineListProps): JSX.Element => {
  return (
    <div>
      {timelines.map((timeline) => (
        <TimelineCard
          key={timeline.id}
          timeline={timeline}
          isDefault={timelines.length === 1}
          visibleEventIds={visibleEventIds}
          partiallyVisibleEventIds={partiallyVisibleEventIds}
          selectedEventIds={selectedEventIds}
          onEditEvent={onEditEvent}
          onMoveEvent={onMoveEvent}
          onToggleEventSelected={onToggleEventSelected}
          onArchiveEvent={onArchiveEvent}
          onShowTimelineEvents={onShowTimelineEvents}
          onHideTimelineEvents={onHideTimelineEvents}
          onShowTimeline={onShowTimeline}
          onHideTimeline={onHideTimeline}
        />
      ))}
    </div>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelineList;
