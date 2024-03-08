import TimelineCard from "metabase/timelines/questions/components/TimelineCard/TimelineCard";
import type { Timeline, TimelineEvent } from "metabase-types/api";

export interface TimelineListProps {
  timelines: Timeline[];
  visibleEventIds: number[];
  selectedEventIds?: number[];
  onEditEvent?: (event: TimelineEvent) => void;
  onMoveEvent?: (event: TimelineEvent) => void;
  onArchiveEvent?: (event: TimelineEvent) => void;
  onToggleEventSelected?: (event: TimelineEvent, isSelected: boolean) => void;
  onShowTimelineEvents: (timelineEvent: TimelineEvent[]) => void;
  onHideTimelineEvents: (timelineEvent: TimelineEvent[]) => void;
}

const TimelineList = ({
  timelines,
  visibleEventIds,
  selectedEventIds = [],
  onEditEvent,
  onMoveEvent,
  onArchiveEvent,
  onToggleEventSelected,
  onShowTimelineEvents,
  onHideTimelineEvents,
}: TimelineListProps): JSX.Element => {
  return (
    <div>
      {timelines.map(timeline => (
        <TimelineCard
          key={timeline.id}
          timeline={timeline}
          isDefault={timelines.length === 1}
          visibleEventIds={visibleEventIds}
          selectedEventIds={selectedEventIds}
          onEditEvent={onEditEvent}
          onMoveEvent={onMoveEvent}
          onToggleEventSelected={onToggleEventSelected}
          onArchiveEvent={onArchiveEvent}
          onShowTimelineEvents={onShowTimelineEvents}
          onHideTimelineEvents={onHideTimelineEvents}
        />
      ))}
    </div>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelineList;
