import type { Timeline } from "metabase-types/api";

import TimelineCard from "../TimelineCard";

import S from "./TimelineList.module.css";

export interface TimelineListProps {
  timelines: Timeline[];
  onUnarchive?: (timeline: Timeline) => void;
}

const TimelineList = ({
  timelines,
  onUnarchive,
}: TimelineListProps): JSX.Element => {
  return (
    <div className={S.ListRoot}>
      {timelines.map((timeline) => (
        <TimelineCard
          key={timeline.id}
          timeline={timeline}
          onUnarchive={onUnarchive}
        />
      ))}
    </div>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelineList;
