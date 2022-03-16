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
  selectedEventIds?: number[];
  selectedTimelineIds?: number[];
  onNewEvent?: () => void;
  onNewEventWithTimeline?: () => void;
  onEditEvent?: (event: TimelineEvent) => void;
  onArchiveEvent?: (event: TimelineEvent) => void;
  onToggleTimeline?: (timeline: Timeline, isVisible: boolean) => void;
}

const TimelinePanel = ({
  timelines,
  collection,
  selectedEventIds,
  selectedTimelineIds,
  onNewEvent,
  onNewEventWithTimeline,
  onEditEvent,
  onArchiveEvent,
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
          collection={collection}
          selectedEventIds={selectedEventIds}
          selectedTimelineIds={selectedTimelineIds}
          onToggleTimeline={onToggleTimeline}
          onEditEvent={onEditEvent}
          onArchiveEvent={onArchiveEvent}
        />
      ) : (
        <TimelineEmptyState
          collection={collection}
          onNewEventWithTimeline={onNewEventWithTimeline}
        />
      )}
    </PanelRoot>
  );
};

export default TimelinePanel;
