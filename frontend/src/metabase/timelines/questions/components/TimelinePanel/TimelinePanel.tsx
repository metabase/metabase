import React from "react";
import { t } from "ttag";
import { Moment } from "moment";
import Settings from "metabase/lib/settings";
import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import Button from "metabase/core/components/Button";
import { Collection, Timeline, TimelineEvent } from "metabase-types/api";
import TimelineList from "../TimelineList";
import TimelineEmptyState from "../TimelineEmptyState";
import { PanelCaption, PanelRoot, PanelToolbar } from "./TimelinePanel.styled";

export interface TimelinePanelProps {
  timelines: Timeline[];
  collection: Collection;
  visibleTimelineIds?: number[];
  selectedEventIds?: number[];
  xDomain?: [Moment, Moment];
  onNewEvent?: () => void;
  onEditEvent?: (event: TimelineEvent) => void;
  onArchiveEvent?: (event: TimelineEvent) => void;
  onToggleTimeline?: (timeline: Timeline, isVisible: boolean) => void;
}

const TimelinePanel = ({
  timelines,
  collection,
  visibleTimelineIds,
  selectedEventIds,
  xDomain,
  onNewEvent,
  onEditEvent,
  onArchiveEvent,
  onToggleTimeline,
}: TimelinePanelProps): JSX.Element => {
  const isEmpty = timelines.length === 0;
  const canWrite = collection.can_write;

  return (
    <PanelRoot>
      {!isEmpty && xDomain && (
        <PanelCaption>{formatCaption(xDomain)}</PanelCaption>
      )}
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

const formatCaption = (xDomain: [Moment, Moment]) => {
  return t`${formatDate(xDomain[0])} — ${formatDate(xDomain[1])}`;
};

const formatDate = (date: Moment) => {
  return formatDateTimeWithUnit(date, "day", Settings.formattingOptions());
};

export default TimelinePanel;
