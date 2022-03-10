import React from "react";
import { Timeline } from "metabase-types/api";
import TimelineList from "../TimelineList";
import TimelineEmptyState from "../TimelineEmptyState";
import { PanelRoot } from "./TimelinePanel.styled";

export interface TimelinePanelProps {
  timelines: Timeline[];
  visibility: Record<number, boolean>;
  onToggleTimeline?: (timeline: Timeline, isVisible: boolean) => void;
}

const TimelinePanel = ({
  timelines,
  visibility,
  onToggleTimeline,
}: TimelinePanelProps): JSX.Element => {
  const isEmpty = timelines.length === 0;

  return (
    <PanelRoot>
      {!isEmpty ? (
        <TimelineList
          timelines={timelines}
          visibility={visibility}
          onToggleTimeline={onToggleTimeline}
        />
      ) : (
        <TimelineEmptyState />
      )}
    </PanelRoot>
  );
};

export default TimelinePanel;
