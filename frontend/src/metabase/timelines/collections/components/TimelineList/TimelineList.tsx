import type { Timeline } from "metabase-types/api";

import TimelineCard from "../TimelineCard";

import { ListRoot } from "./TimelineList.styled";

export interface TimelineListProps {
  timelines: Timeline[];
  onUnarchive?: (timeline: Timeline) => void;
}

const TimelineList = ({
  timelines,
  onUnarchive,
}: TimelineListProps): JSX.Element => {
  return (
    <ListRoot>
      {timelines.map(timeline => (
        <TimelineCard
          key={timeline.id}
          timeline={timeline}
          onUnarchive={onUnarchive}
        />
      ))}
    </ListRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelineList;
