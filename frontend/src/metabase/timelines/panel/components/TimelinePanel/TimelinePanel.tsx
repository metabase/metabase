import { t } from "ttag";

import { Box, Button } from "metabase/ui";
import type { Collection, Timeline, TimelineEvent } from "metabase-types/api";

import TimelineEmptyState from "../TimelineEmptyState";
import TimelineList from "../TimelineList";

export interface TimelinePanelProps {
  timelines: Timeline[];
  collection: Collection;
  visibleEventIds: number[];
  partiallyVisibleEventIds?: number[];
  selectedEventIds?: number[];
  onNewEvent?: () => void;
  onEditEvent?: (event: TimelineEvent) => void;
  onMoveEvent?: (event: TimelineEvent) => void;
  onArchiveEvent?: (event: TimelineEvent) => void;
  onToggleEventSelected?: (event: TimelineEvent, isSelected: boolean) => void;
  onShowTimelineEvents: (timelineEvent: TimelineEvent[]) => void;
  onHideTimelineEvents: (timelineEvent: TimelineEvent[]) => void;
  onShowTimeline: (timeline: Timeline) => void;
  onHideTimeline: (timeline: Timeline) => void;
}

const TimelinePanel = ({
  timelines,
  collection,
  visibleEventIds,
  partiallyVisibleEventIds,
  selectedEventIds,
  onNewEvent,
  onEditEvent,
  onMoveEvent,
  onArchiveEvent,
  onToggleEventSelected,
  onShowTimelineEvents,
  onHideTimelineEvents,
  onShowTimeline,
  onHideTimeline,
}: TimelinePanelProps): JSX.Element => {
  const isEmpty = timelines.length === 0;
  const canWrite = collection.can_write;
  const canCreateEvent = canWrite && onNewEvent != null;

  return (
    <Box mx="xl">
      {!isEmpty && canCreateEvent && (
        <Box mb="lg">
          <Button onClick={onNewEvent}>{t`Create event`}</Button>
        </Box>
      )}
      {!isEmpty ? (
        <TimelineList
          timelines={timelines}
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
      ) : (
        <TimelineEmptyState
          timelines={timelines}
          collection={collection}
          onNewEvent={onNewEvent}
        />
      )}
    </Box>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelinePanel;
