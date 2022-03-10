import React from "react";
import { Collection, Timeline, TimelineEvent } from "metabase-types/api";
import TimelineCard from "metabase/timelines/questions/components/TimelineCard/TimelineCard";

export interface TimelineListProps {
  timelines: Timeline[];
  collection: Collection;
  visibility?: Record<number, boolean>;
  isVisibleByDefault?: boolean;
  onToggleTimeline?: (timeline: Timeline, isVisible: boolean) => void;
  onEditEvent?: (event: TimelineEvent) => void;
  onArchiveEvent?: (event: TimelineEvent) => void;
}

const TimelineList = ({
  timelines,
  collection,
  visibility = {},
  isVisibleByDefault = false,
  onToggleTimeline,
  onEditEvent,
  onArchiveEvent,
}: TimelineListProps): JSX.Element => {
  return (
    <div>
      {timelines.map(timeline => (
        <TimelineCard
          key={timeline.id}
          timeline={timeline}
          collection={collection}
          isVisible={visibility[timeline.id] ?? isVisibleByDefault}
          onToggleTimeline={onToggleTimeline}
          onEditEvent={onEditEvent}
          onArchiveEvent={onArchiveEvent}
        />
      ))}
    </div>
  );
};

export default TimelineList;
