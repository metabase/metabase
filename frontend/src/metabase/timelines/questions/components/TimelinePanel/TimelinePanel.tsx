import React from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button";
import { Collection, Timeline, TimelineEvent } from "metabase-types/api";
import TimelineList from "../TimelineList";
import TimelineEmptyState from "../TimelineEmptyState";
import { PanelRoot, PanelToolbar } from "./TimelinePanel.styled";

export interface TimelinePanelProps {
  timelines: Timeline[];
  collection: Collection;
  visibleTimelineIds?: number[];
  selectedEventIds?: number[];
  onNewEvent?: () => void;
  onEditEvent?: (event: TimelineEvent) => void;
  onMoveEvent?: (event: TimelineEvent) => void;
  onArchiveEvent?: (event: TimelineEvent) => void;
  onToggleEvent?: (event: TimelineEvent, isSelected: boolean) => void;
  onToggleTimeline?: (timeline: Timeline, isVisible: boolean) => void;
}

const TimelinePanel = ({
  timelines,
  collection,
  visibleTimelineIds,
  selectedEventIds,
  onNewEvent,
  onEditEvent,
  onMoveEvent,
  onArchiveEvent,
  onToggleEvent,
  onToggleTimeline,
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
          visibleTimelineIds={visibleTimelineIds}
          selectedEventIds={selectedEventIds}
          onToggleTimeline={onToggleTimeline}
          onEditEvent={onEditEvent}
          onMoveEvent={onMoveEvent}
          onToggleEvent={onToggleEvent}
          onArchiveEvent={onArchiveEvent}
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

export default TimelinePanel;
