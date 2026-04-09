import { t } from "ttag";

import { Button } from "metabase/common/components/Button";
import { Box } from "metabase/ui";
import type { Collection, Timeline, TimelineEvent } from "metabase-types/api";

import TimelineEmptyState from "../TimelineEmptyState";
import TimelineList from "../TimelineList";

export interface TimelinePanelProps {
  timelines: Timeline[];
  collection: Collection;
  visibleEventIds: number[];
  selectedEventIds?: number[];
  onNewEvent?: () => void;
  onEditEvent?: (event: TimelineEvent) => void;
  onMoveEvent?: (event: TimelineEvent) => void;
  onArchiveEvent?: (event: TimelineEvent) => void;
  onToggleEventSelected?: (event: TimelineEvent, isSelected: boolean) => void;
  onShowTimelineEvents: (timelineEvent: TimelineEvent[]) => void;
  onHideTimelineEvents: (timelineEvent: TimelineEvent[]) => void;
}

const TimelinePanel = ({
  timelines,
  collection,
  visibleEventIds,
  selectedEventIds,
  onNewEvent,
  onEditEvent,
  onMoveEvent,
  onArchiveEvent,
  onToggleEventSelected,
  onShowTimelineEvents,
  onHideTimelineEvents,
}: TimelinePanelProps): JSX.Element => {
  const isEmpty = timelines.length === 0;
  const canWrite = collection.can_write;

  return (
    <Box mx="lg">
      {!isEmpty && canWrite && (
        <Box mb="md">
          <Button onClick={onNewEvent}>{t`Create event`}</Button>
        </Box>
      )}
      {!isEmpty ? (
        <TimelineList
          timelines={timelines}
          visibleEventIds={visibleEventIds}
          selectedEventIds={selectedEventIds}
          onEditEvent={onEditEvent}
          onMoveEvent={onMoveEvent}
          onToggleEventSelected={onToggleEventSelected}
          onArchiveEvent={onArchiveEvent}
          onShowTimelineEvents={onShowTimelineEvents}
          onHideTimelineEvents={onHideTimelineEvents}
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
