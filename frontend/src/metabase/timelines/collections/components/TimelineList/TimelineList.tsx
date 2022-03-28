import React from "react";
import { Collection, Timeline } from "metabase-types/api";
import TimelineCard from "../TimelineCard";
import { ListRoot } from "./TimelineList.styled";

export interface TimelineListProps {
  timelines: Timeline[];
  collection: Collection;
  onUnarchive?: (timeline: Timeline) => void;
}

const TimelineList = ({
  timelines,
  collection,
  onUnarchive,
}: TimelineListProps): JSX.Element => {
  return (
    <ListRoot>
      {timelines.map(timeline => (
        <TimelineCard
          key={timeline.id}
          timeline={timeline}
          collection={collection}
          onUnarchive={onUnarchive}
        />
      ))}
    </ListRoot>
  );
};

export default TimelineList;
