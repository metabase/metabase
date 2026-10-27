import { type JSX, useMemo } from "react";
import { match } from "ts-pattern";

import { getSortedTimelines } from "metabase/common/utils/timelines";
import { TimelineModalScrollArea } from "metabase/timelines/common/components/TimelineModal";
import type { Collection, Timeline } from "metabase-types/api";

import SearchEmptyState from "../SearchEmptyState";
import TimelineEmptyState from "../TimelineEmptyState";
import TimelineList from "../TimelineList";

export interface TimelineListContentProps {
  timelines: Timeline[];
  collection: Collection;
  isArchive?: boolean;
  onUnarchive?: (timeline: Timeline) => void;
}

const TimelineListContent = ({
  timelines,
  collection,
  isArchive = false,
  onUnarchive,
}: TimelineListContentProps): JSX.Element => {
  const hasTimelines = timelines.length > 0;

  const sortedTimelines = useMemo(() => {
    return getSortedTimelines(timelines, collection);
  }, [timelines, collection]);

  return (
    <TimelineModalScrollArea justify={hasTimelines ? undefined : "center"}>
      {match({ hasTimelines, isArchive })
        .with({ hasTimelines: true }, () => (
          <TimelineList timelines={sortedTimelines} onUnarchive={onUnarchive} />
        ))
        .with({ isArchive: true }, () => <SearchEmptyState isTimeline />)
        .otherwise(() => (
          <TimelineEmptyState collection={collection} />
        ))}
    </TimelineModalScrollArea>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelineListContent;
