import React from "react";
import { Collection, Timeline, TimelineEvent } from "metabase-types/api";
import TimelineList from "../TimelineList";
import TimelineEmptyState from "../TimelineEmptyState";
import { PanelRoot } from "./TimelinePanel.styled";

export interface TimelinePanelProps {
  timelines: Timeline[];
  collection: Collection;
  visibility?: Record<number, boolean>;
  isVisibleByDefault?: boolean;
  onToggleTimeline?: (timeline: Timeline, isVisible: boolean) => void;
  onEditEvent?: (event: TimelineEvent) => void;
  onArchiveEvent?: (event: TimelineEvent) => void;
}

const TimelinePanel = ({
  timelines,
  collection,
  visibility,
  isVisibleByDefault,
  onToggleTimeline,
  onEditEvent,
  onArchiveEvent,
}: TimelinePanelProps): JSX.Element => {
  const isEmpty = timelines.length === 0;

  return (
    <PanelRoot>
      {!isEmpty ? (
        <TimelineList
          timelines={timelines}
          collection={collection}
          visibility={visibility}
          isVisibleByDefault={isVisibleByDefault}
          onToggleTimeline={onToggleTimeline}
          onEditEvent={onEditEvent}
          onArchiveEvent={onArchiveEvent}
        />
      ) : (
        <TimelineEmptyState collection={collection} />
      )}
    </PanelRoot>
  );
};

export default TimelinePanel;
