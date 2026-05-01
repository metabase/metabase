import { useCallback, useEffect, useMemo, useState } from "react";

import {
  skipToken,
  useGetExplorationQuery,
  useListTimelinesQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Center, Group } from "metabase/ui";
import type {
  Exploration,
  ExplorationQuery,
  ExplorationQueryId,
  ExplorationThread,
  ExplorationThreadId,
  Timeline,
  TimelineEvent,
  TimelineId,
} from "metabase-types/api";
import { isSettledExplorationQueryStatus } from "metabase-types/api";

import { ExplorationSidebar } from "../components/ExplorationSidebar";
import { ExplorationVisualization } from "../components/ExplorationVisualization";

const QUERY_POLL_INTERVAL_MS = 2000;

interface ExplorationPageProps {
  params: { id: string };
}

export type ExplorationQueryWithName = Omit<ExplorationQuery, "name"> & {
  name: string; // we only render queries with names
};

export type ThreadsWithSortedQueries = Omit<ExplorationThread, "queries"> & {
  queries: ExplorationQueryWithName[];
};

function hasUnsettledQueries(exploration: Exploration | undefined): boolean {
  if (!exploration?.threads) {
    return false;
  }
  return exploration.threads.some((thread) =>
    thread.queries?.some((q) => !isSettledExplorationQueryStatus(q.status)),
  );
}

export function ExplorationPage({ params }: ExplorationPageProps) {
  // Poll the exploration while any query is still in a non-terminal state.
  // RTK Query reads `pollingInterval` on every render, so deriving it from
  // the response is enough — passing 0 stops polling.
  const [shouldPoll, setShouldPoll] = useState(true);
  const [selectedQueryId, setSelectedQueryId] =
    useState<ExplorationQueryId | null>(null);
  const [selectedTimelineIdsByThreadId, setSelectedTimelineIdsByThreadId] =
    useState<Record<ExplorationThreadId, Set<TimelineId>>>({});

  const {
    data: exploration,
    isLoading,
    error,
  } = useGetExplorationQuery(Number(params.id), {
    pollingInterval: shouldPoll ? QUERY_POLL_INTERVAL_MS : 0,
  });

  useEffect(() => {
    setShouldPoll(hasUnsettledQueries(exploration));
  }, [exploration]);

  const explorationHasTimelines = useMemo(() => {
    return exploration?.threads?.some(
      (thread) => (thread.timelines?.length ?? 0) > 0,
    );
  }, [exploration]);

  const { data: allTimelines = [] } = useListTimelinesQuery(
    explorationHasTimelines
      ? {
          include: "events",
        }
      : skipToken,
  );

  const allTimelinesById: Map<TimelineId, Timeline> = useMemo(() => {
    return new Map(allTimelines.map((timeline) => [timeline.id, timeline]));
  }, [allTimelines]);

  const threadsWithSortedQueries: ThreadsWithSortedQueries[] = useMemo(() => {
    if (!exploration?.threads) {
      return [];
    }
    return exploration.threads.map((thread) => {
      return {
        ...thread,
        queries:
          thread.queries
            ?.filter((query): query is ExplorationQueryWithName =>
              Boolean(query.name),
            )
            .toSorted(
              (a, b) =>
                (b.interestingness_score ?? -1) -
                (a.interestingness_score ?? -1),
            ) ?? [],
      };
    });
  }, [exploration]);

  useEffect(() => {
    if (selectedQueryId !== null) {
      return;
    }
    if (threadsWithSortedQueries[0]?.queries[0]?.id) {
      setSelectedQueryId(threadsWithSortedQueries[0].queries[0].id);
    }
  }, [threadsWithSortedQueries, selectedQueryId]);

  const queryIdToQueryAndThread: Map<
    ExplorationQueryId,
    { query: ExplorationQuery; thread: ExplorationThread }
  > = useMemo(() => {
    return new Map(
      exploration?.threads?.flatMap(
        (thread) =>
          thread.queries?.map((query) => [query.id, { query, thread }]) ?? [],
      ) ?? [],
    );
  }, [exploration]);

  const { query: selectedQuery, thread: selectedThread } = useMemo<{
    query?: ExplorationQuery;
    thread?: ExplorationThread;
  }>(
    () =>
      selectedQueryId
        ? (queryIdToQueryAndThread.get(selectedQueryId) ?? {})
        : {},
    [selectedQueryId, queryIdToQueryAndThread],
  );

  const availableTimelines: Timeline[] = useMemo(() => {
    return (
      selectedThread?.timelines
        ?.map((timeline) => allTimelinesById.get(timeline.timeline_id))
        .filter((timeline) => timeline !== undefined) ?? []
    );
  }, [selectedThread, allTimelinesById]);

  const selectedTimelineIds: Set<TimelineId> = useMemo(() => {
    if (!selectedThread) {
      return new Set();
    }
    return selectedTimelineIdsByThreadId[selectedThread.id] ?? new Set();
  }, [selectedThread, selectedTimelineIdsByThreadId]);

  const timelineEvents: TimelineEvent[] = useMemo(() => {
    return availableTimelines
      .filter((timeline) => selectedTimelineIds.has(timeline.id))
      .flatMap((timeline) => timeline.events ?? []);
  }, [availableTimelines, selectedTimelineIds]);

  const handleToggleTimelineId = useCallback(
    (timelineId: TimelineId) => {
      if (!selectedThread) {
        return;
      }
      const newSelectedTimelineIds = new Set(selectedTimelineIds);
      if (newSelectedTimelineIds.has(timelineId)) {
        newSelectedTimelineIds.delete(timelineId);
      } else {
        newSelectedTimelineIds.add(timelineId);
      }
      setSelectedTimelineIdsByThreadId((prev) => ({
        ...prev,
        [selectedThread.id]: newSelectedTimelineIds,
      }));
    },
    [selectedThread, selectedTimelineIds, setSelectedTimelineIdsByThreadId],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, select, [contenteditable=true]")
      ) {
        return;
      }
      const sortedQueries = threadsWithSortedQueries.flatMap(
        (thread) => thread.queries,
      );
      if (sortedQueries.length === 0) {
        return;
      }
      const currentQueryIndex = sortedQueries.findIndex(
        (query) => query.id === selectedQueryId,
      );
      const nextQueryIndex =
        (currentQueryIndex +
          (event.key === "ArrowRight" ? 1 : -1) +
          sortedQueries.length) %
        sortedQueries.length;
      const nextSelectedQueryId = sortedQueries[nextQueryIndex].id;
      if (
        nextSelectedQueryId !== undefined &&
        nextSelectedQueryId !== selectedQueryId
      ) {
        setSelectedQueryId(nextSelectedQueryId);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [threadsWithSortedQueries, selectedQueryId, setSelectedQueryId]);

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (!exploration) {
    return null;
  }

  return (
    <Center p="3rem" h="100%" bg="background-secondary">
      <Group
        h="100%"
        w="100%"
        maw="90rem"
        align="flex-start"
        wrap="nowrap"
        gap="xl"
      >
        <ExplorationSidebar
          exploration={exploration}
          selectedQueryId={selectedQueryId}
          setSelectedQueryId={setSelectedQueryId}
          threadsWithSortedQueries={threadsWithSortedQueries}
        />
        {selectedQuery && (
          <ExplorationVisualization
            explorationQuery={selectedQuery}
            availableTimelines={availableTimelines}
            selectedTimelineIds={selectedTimelineIds}
            onToggleTimelineId={handleToggleTimelineId}
            timelineEvents={timelineEvents}
          />
        )}
      </Group>
    </Center>
  );
}
