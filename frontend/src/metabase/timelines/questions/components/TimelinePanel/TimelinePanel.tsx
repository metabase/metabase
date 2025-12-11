import { t } from "ttag";

import Button from "metabase/common/components/Button";
import type { Collection, Timeline, TimelineEvent } from "metabase-types/api";

import TimelineEmptyState from "../TimelineEmptyState";
import TimelineList from "../TimelineList";

import S from "./TimelinePanel.module.css";

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
    <div className={S.PanelRoot}>
      {!isEmpty && canWrite && (
        <div className={S.PanelToolbar}>
          <Button onClick={onNewEvent}>{t`Create event`}</Button>
        </div>
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
    </div>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelinePanel;
