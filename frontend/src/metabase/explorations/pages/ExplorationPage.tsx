import { useCallback, useEffect, useMemo, useState } from "react";
import { push } from "react-router-redux";

import {
  skipToken,
  useGetExplorationQuery,
  useListTimelinesQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/redux";
import { Box, Group } from "metabase/ui";
import type {
  DocumentId,
  Exploration,
  ExplorationDocument,
  ExplorationQuery,
  ExplorationQueryGroup,
  ExplorationQueryGroupId,
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
import {
  ExplorationGroupVisualization,
  ExplorationVisualization,
} from "../components/ExplorationVisualization";

const QUERY_POLL_INTERVAL_MS = 2000;

interface ExplorationPageProps {
  params: {
    id: string;
    entityType?: "query" | "document" | "group";
    entityId?: string;
  };
  children?: React.ReactNode;
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

interface SelectedGroupId {
  type: "group";
  id: ExplorationQueryGroupId;
}

export type SelectedEntityId =
  | SelectedQueryId
  | SelectedDocumentId
  | SelectedGroupId;

export function ExplorationPage({ params, children }: ExplorationPageProps) {
  const selectedEntityId: SelectedEntityId | null = useMemo(() => {
    if (!params.entityType || !params.entityId) {
      return null;
    }
    // Group ids are opaque strings (e.g. "auto:42:dim-foo") with colons —
    // we URL-encode them on push and decode them here.
    if (params.entityType === "group") {
      return { type: "group", id: decodeURIComponent(params.entityId) };
    }
    return { type: params.entityType, id: Number(params.entityId) };
  }, [params.entityType, params.entityId]);

  const dispatch = useDispatch();

  const setSelectedEntityId = useCallback(
    (entityId: SelectedEntityId) => {
      const idSegment =
        entityId.type === "group"
          ? encodeURIComponent(entityId.id)
          : entityId.id;
      dispatch(
        push(`/explorations/${params.id}/${entityId.type}/${idSegment}`),
      );
    },
    [dispatch, params.id],
  );

  // Poll the exploration while any query is still in a non-terminal state.
  // RTK Query reads `pollingInterval` on every render, so deriving it from
  // the response is enough — passing 0 stops polling.
  const [shouldPoll, setShouldPoll] = useState(true);
  const [selectedTimelineIdByThreadId, setSelectedTimelineIdByThreadId] =
    useState<Record<ExplorationThreadId, TimelineId | null>>({});

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
    if (selectedEntityId !== null) {
      return;
    }
    if (threadsWithSortedQueries[0]?.queries[0]?.id) {
      setSelectedEntityId({
        type: "query",
        id: threadsWithSortedQueries[0].queries[0].id,
      });
    }
  }, [threadsWithSortedQueries, selectedEntityId, setSelectedEntityId]);

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

  const groupIdToGroupAndQueries: Map<
    ExplorationQueryGroupId,
    {
      group: ExplorationQueryGroup;
      thread: ExplorationThread;
      queries: ExplorationQuery[];
    }
  > = useMemo(() => {
    const map = new Map<
      ExplorationQueryGroupId,
      {
        group: ExplorationQueryGroup;
        thread: ExplorationThread;
        queries: ExplorationQuery[];
      }
    >();
    for (const thread of exploration?.threads ?? []) {
      const queriesById = new Map((thread.queries ?? []).map((q) => [q.id, q]));
      for (const group of thread.groups ?? []) {
        const queries = group.query_ids
          .map((id) => queriesById.get(id))
          .filter((q): q is ExplorationQuery => q !== undefined);
        map.set(group.id, { group, thread, queries });
      }
    }
    return map;
  }, [exploration]);

  const selectedGroup = useMemo(() => {
    return selectedEntityId?.type === "group"
      ? groupIdToGroupAndQueries.get(selectedEntityId.id)
      : undefined;
  }, [selectedEntityId, groupIdToGroupAndQueries]);

  // For a selected group, treat the group's thread as the "selected thread"
  // so timeline plumbing (timeline dropdown, per-thread selection memory)
  // continues to work uniformly.
  const effectiveSelectedThread = selectedThread ?? selectedGroup?.thread;

  const availableTimelines: Timeline[] = useMemo(() => {
    return (
      effectiveSelectedThread?.timelines
        ?.map((timeline) => allTimelinesById.get(timeline.timeline_id))
        .filter((timeline) => timeline !== undefined) ?? []
    );
  }, [effectiveSelectedThread, allTimelinesById]);

  const selectedTimelineId: TimelineId | null = useMemo(() => {
    if (!effectiveSelectedThread) {
      return null;
    }
    return selectedTimelineIdByThreadId[effectiveSelectedThread.id] ?? null;
  }, [effectiveSelectedThread, selectedTimelineIdByThreadId]);

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
      if (!effectiveSelectedThread) {
        return;
      }
      setSelectedTimelineIdByThreadId((prev) => ({
        ...prev,
        [effectiveSelectedThread.id]: timelineId,
      }));
    },
    [effectiveSelectedThread, setSelectedTimelineIdByThreadId],
  );

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (!exploration) {
    return null;
  }

  return (
    <Group
      pl="3rem"
      h="100%"
      w="100%"
      bg="background-secondary"
      align="flex-start"
      wrap="nowrap"
      gap="xl"
      data-test-id="exploration-page"
    >
      <ExplorationSidebar
        exploration={exploration}
        selectedEntityId={selectedEntityId}
        setSelectedEntityId={setSelectedEntityId}
        threadsWithSortedQueries={threadsWithSortedQueries}
      />
      {selectedThread && selectedQuery && (
        <ExplorationVisualization
          explorationQuery={selectedQuery}
          explorationThread={selectedThread}
          availableTimelines={availableTimelines}
          selectedTimelineId={selectedTimelineId}
          onSelectTimelineId={handleSelectTimelineId}
          timelineEvents={timelineEvents}
        />
      )}
      {selectedGroup && (
        <ExplorationGroupVisualization
          // Key on group id so the component remounts when the user
          // navigates between `page` groups. The body calls one
          // RTKQ hook per query, so the hook count must be stable for
          // the lifetime of a single mount; remounting on group switch
          // guarantees that.
          key={selectedGroup.group.id}
          group={selectedGroup.group}
          queries={selectedGroup.queries}
          explorationThread={selectedGroup.thread}
          availableTimelines={availableTimelines}
          selectedTimelineId={selectedTimelineId}
          onSelectTimelineId={handleSelectTimelineId}
          timelineEvents={timelineEvents}
        />
      )}
      {selectedDocument && (
        <ExplorationDocumentComponent document={selectedDocument} />
      )}
      <Box bg="background-primary">{children}</Box>
    </Group>
  );
}
