import { t } from "ttag";

import Button from "metabase/core/components/Button";
import type { Collection, Timeline, TimelineEvent } from "metabase-types/api";

import TimelineEmptyState from "../TimelineEmptyState";
import TimelineList from "../TimelineList";

import { PanelRoot, PanelToolbar } from "./TimelinePanel.styled";

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
    <PanelRoot>
      {!isEmpty && canWrite && (
        <PanelToolbar>
          <Button onClick={onNewEvent}>{t`Add an event`}</Button>
        </PanelToolbar>
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
    </PanelRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelinePanel;
