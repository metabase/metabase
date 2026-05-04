import { useCallback, useEffect, useMemo, useState } from "react";

import {
  skipToken,
  useGetExplorationQuery,
  useListTimelinesQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Center, Group } from "metabase/ui";
import type {
  DocumentId,
  Exploration,
  ExplorationDocument,
  ExplorationQuery,
  ExplorationQueryId,
  ExplorationQueryWithName,
  ExplorationThread,
  ExplorationThreadId,
  ThreadsWithSortedQueries,
  Timeline,
  TimelineEvent,
  TimelineId,
} from "metabase-types/api";
import { isSettledExplorationQueryStatus } from "metabase-types/api";

import { ExplorationDocument as ExplorationDocumentComponent } from "../components/ExplorationDocument";
import { ExplorationSidebar } from "../components/ExplorationSidebar";
import { ExplorationVisualization } from "../components/ExplorationVisualization";
import { getAdjacentById, shouldIgnoreKeyboardEvent } from "../utils";

const QUERY_POLL_INTERVAL_MS = 2000;

interface ExplorationPageProps {
  params: { id: string };
}

function hasUnsettledQueries(exploration: Exploration | undefined): boolean {
  if (!exploration?.threads) {
    return false;
  }
  return exploration.threads.some((thread) =>
    thread.queries?.some((q) => !isSettledExplorationQueryStatus(q.status)),
  );
}

interface SelectedQueryId {
  type: "query";
  id: ExplorationQueryId;
}

interface SelectedDocumentId {
  type: "document";
  id: DocumentId;
}

export type SelectedEntityId = SelectedQueryId | SelectedDocumentId;

// todo delete me
const DEFAULT_DOCUMENT = {
  type: "document",
  id: 1,
  exploration_thread_id: 1,
  name: "Findings",
};

export function ExplorationPage({ params }: ExplorationPageProps) {
  // Poll the exploration while any query is still in a non-terminal state.
  // RTK Query reads `pollingInterval` on every render, so deriving it from
  // the response is enough — passing 0 stops polling.
  const [shouldPoll, setShouldPoll] = useState(true);
  const [selectedEntityId, setSelectedEntityId] =
    useState<SelectedEntityId | null>(null);
  const [selectedTimelineIdByThreadId, setSelectedTimelineIdByThreadId] =
    useState<Record<ExplorationThreadId, TimelineId | null>>({});

  const {
    data: _exploration,
    isLoading,
    error,
  } = useGetExplorationQuery(Number(params.id), {
    pollingInterval: shouldPoll ? QUERY_POLL_INTERVAL_MS : 0,
  });

  // todo delete me
  const exploration: Exploration | undefined = useMemo(() => {
    if (!_exploration) {
      return undefined;
    }
    return {
      ..._exploration,
      threads: _exploration?.threads?.map((thread) => ({
        ...thread,
        documents: [...(thread.documents ?? []), DEFAULT_DOCUMENT],
      })),
    };
  }, [_exploration]);

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
    if (selectedEntityId !== null) {
      return;
    }
    if (threadsWithSortedQueries[0]?.queries[0]?.id) {
      setSelectedEntityId({
        type: "query",
        id: threadsWithSortedQueries[0].queries[0].id,
      });
    }
  }, [threadsWithSortedQueries, selectedEntityId]);

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
      selectedEntityId?.type === "query"
        ? (queryIdToQueryAndThread.get(selectedEntityId.id) ?? {})
        : {},
    [selectedEntityId, queryIdToQueryAndThread],
  );

  const documentIdToDocument: Map<DocumentId, ExplorationDocument> =
    useMemo(() => {
      return new Map(
        exploration?.threads?.flatMap(
          (thread) =>
            thread.documents?.map((document) => [document.id, document]) ?? [],
        ) ?? [],
      );
    }, [exploration]);

  const selectedDocument = useMemo(() => {
    return selectedEntityId?.type === "document"
      ? documentIdToDocument.get(selectedEntityId.id)
      : undefined;
  }, [selectedEntityId, documentIdToDocument]);

  const availableTimelines: Timeline[] = useMemo(() => {
    return (
      selectedThread?.timelines
        ?.map((timeline) => allTimelinesById.get(timeline.timeline_id))
        .filter((timeline) => timeline !== undefined) ?? []
    );
  }, [selectedThread, allTimelinesById]);

  const selectedTimelineId: TimelineId | null = useMemo(() => {
    if (!selectedThread) {
      return null;
    }
    return selectedTimelineIdByThreadId[selectedThread.id] ?? null;
  }, [selectedThread, selectedTimelineIdByThreadId]);

  const timelineEvents: TimelineEvent[] = useMemo(() => {
    if (selectedTimelineId == null) {
      return [];
    }
    return (
      availableTimelines.find((timeline) => timeline.id === selectedTimelineId)
        ?.events ?? []
    );
  }, [availableTimelines, selectedTimelineId]);

  const handleSelectTimelineId = useCallback(
    (timelineId: TimelineId | null) => {
      if (!selectedThread) {
        return;
      }
      setSelectedTimelineIdByThreadId((prev) => ({
        ...prev,
        [selectedThread.id]: timelineId,
      }));
    },
    [selectedThread, setSelectedTimelineIdByThreadId],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (selectedEntityId?.type !== "query") {
        return;
      }
      // up and down arrows are handled by TimelineDropdown, because they should only run when it's mounted
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
        return;
      }
      if (shouldIgnoreKeyboardEvent(event)) {
        return;
      }
      const sortedQueries = threadsWithSortedQueries.flatMap(
        (thread) => thread.queries,
      );
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const nextQuery = getAdjacentById(
        sortedQueries,
        selectedEntityId.id,
        direction,
      );
      if (nextQuery != null && nextQuery.id !== selectedEntityId.id) {
        setSelectedEntityId({ type: "query", id: nextQuery.id });
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [threadsWithSortedQueries, selectedEntityId, setSelectedEntityId]);

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (!exploration) {
    return null;
  }

  return (
    <Center
      p="3rem"
      h="100%"
      bg="background-secondary"
      data-test-id="exploration-page"
    >
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
          selectedEntityId={selectedEntityId}
          setSelectedEntityId={setSelectedEntityId}
          threadsWithSortedQueries={threadsWithSortedQueries}
        />
        {selectedQuery && (
          <ExplorationVisualization
            explorationQuery={selectedQuery}
            availableTimelines={availableTimelines}
            selectedTimelineId={selectedTimelineId}
            onSelectTimelineId={handleSelectTimelineId}
            timelineEvents={timelineEvents}
          />
        )}
        {selectedDocument && <ExplorationDocumentComponent />}
      </Group>
    </Center>
  );
}
