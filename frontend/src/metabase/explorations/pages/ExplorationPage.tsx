import type { Location } from "history";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useGetExplorationQuery, useListTimelinesQuery } from "metabase/api";
import { Api } from "metabase/api/api";
import { idTag } from "metabase/api/tags";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useToast } from "metabase/common/hooks";
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
  ExplorationThread,
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
import {
  getInterestingTimelineIds,
  getMostInterestingTimelineId,
} from "../components/ExplorationVisualization/utils";
import { AUTO_INSIGHTS_DOCUMENT_NAME } from "../constants";

const QUERY_POLL_INTERVAL_MS = 2000;

const NO_TIMELINE_PARAM = "none";
const TIMELINE_QUERY_PARAM = "timeline";

interface ExplorationPageQuery {
  [TIMELINE_QUERY_PARAM]?: string;
}

interface ExplorationPageProps {
  params: {
    id: string;
    entityType?: "query" | "document" | "group";
    entityId?: string;
    childTargetId?: string;
  };
  route: Route;
  location: Location<ExplorationPageQuery>;
  children?: React.ReactNode;
}

function hasUnsettledQueries(exploration: Exploration | undefined): boolean {
  if (!exploration?.threads) {
    return false;
  }
  // Keep polling while either:
  //   (a) any individual query is still running, OR
  //   (b) the thread has been started but isn't fully complete yet — the
  //       backend's `completed_at` is set only after the post-query
  //       auto-insights handler has written its document. While the handler
  //       runs we want the placeholder "Analysis underway" doc to get
  //       swapped for the real one in the sidebar, which only happens via
  //       a poll refresh. Draft threads (no `started_at`) don't trigger
  //       polling — they have nothing in flight.
  return exploration.threads.some(
    (thread) =>
      thread.queries?.some((q) => !isSettledExplorationQueryStatus(q.status)) ||
      (thread.started_at != null && thread.completed_at == null),
  );
}

/**
 * Pick the first entity the sidebar would render so the auto-selection
 * always lands on a row that's actually visible. The sidebar lays out
 * by group `position` (not by raw query interestingness), and a `page`
 * group exposes only the group itself — its constituent queries don't
 * appear as standalone rows. Auto-selecting the first query overall by
 * interestingness can therefore land on a query that has no sidebar
 * row, leaving the highlight + scroll anchor with nothing to follow.
 *
 * Walk threads in order; for each thread walk its position-sorted
 * groups. Return the group itself for `page` groups, or its first
 * `query_ids` entry otherwise. Fall back to the first ungrouped query
 * (defensive — every BE-emitted query is grouped today).
 */
function pickInitialSidebarEntity(
  threads: ExplorationThread[] | undefined,
): SelectedEntityId | null {
  if (!threads) {
    return null;
  }
  for (const thread of threads) {
    const groups = (thread.groups ?? [])
      .slice()
      .sort((a, b) => a.position - b.position);
    for (const group of groups) {
      if (group.display_type === "page") {
        return { type: "group", id: group.id };
      }
      const queryId = group.query_ids[0];
      if (queryId != null) {
        return { type: "query", id: queryId };
      }
    }
    const groupedIds = new Set(
      (thread.groups ?? []).flatMap((g) => g.query_ids),
    );
    const firstUngrouped = (thread.queries ?? []).find(
      (q) => !groupedIds.has(q.id),
    );
    if (firstUngrouped) {
      return { type: "query", id: firstUngrouped.id };
    }
  }
  return null;
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

export function ExplorationPage({
  params,
  route,
  location,
  children,
}: ExplorationPageProps) {
  const dispatch = useDispatch();

  const setSelectedEntityId = useCallback(
    (entityId: SelectedEntityId) => {
      const idSegment =
        entityId.type === "group"
          ? encodeURIComponent(entityId.id)
          : entityId.id;
      const search = location.search ?? "";
      dispatch(
        push(
          `/explorations/${params.id}/${entityId.type}/${idSegment}${search}`,
        ),
      );
    },
    [dispatch, params.id, location.search],
  );

  // Poll the exploration while any query is still in a non-terminal state.
  // RTK Query reads `pollingInterval` on every render, so deriving it from
  // the response is enough — passing 0 stops polling.
  const [shouldPoll, setShouldPoll] = useState(true);

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

  const [sendToast] = useToast();

  const { data: allTimelines = [] } = useListTimelinesQuery({
    include: "events",
  });

  const allTimelinesById: Map<TimelineId, Timeline> = useMemo(() => {
    return new Map(allTimelines.map((timeline) => [timeline.id, timeline]));
  }, [allTimelines]);

  // Selection comes from the URL. When the URL has no entity yet
  // (e.g. user landed on `/explorations/:id` directly), fall back to
  // the first query so the sidebar highlight, the scroll anchor, and
  // the right-pane chart all agree on the very first paint — without
  // waiting for the URL-sync effect below to dispatch a `push()`.
  //
  // Once the URL update lands the fallback drops out (params take
  // precedence) and the URL becomes authoritative again.
  // Selection model:
  //
  //   - The URL is the "pinned by the user" indicator. Only user
  //     clicks call `setSelectedEntityId`, which pushes the entity
  //     into the URL. Once the URL carries an entity, that's
  //     authoritative — no more auto-tracking.
  //
  //   - Until then, every render (including ones triggered by polling
  //     bringing in fresh interestingness scores) re-derives the
  //     selection from the current top of the sidebar via
  //     `pickInitialSidebarEntity`. This is what makes the right pane
  //     and the sidebar follow the "first, most interesting chart"
  //     as new data lands.
  //
  // We deliberately do NOT push the auto-derived selection into the
  // URL: doing so would freeze the selection at the first auto-pick
  // and prevent it from following subsequent data updates.
  const selectedEntityId: SelectedEntityId | null = useMemo(() => {
    if (params.entityType && params.entityId) {
      // Group ids are opaque strings (e.g. "auto:42:dim-foo") with
      // colons — we URL-encode them on push and decode them here.
      if (params.entityType === "group") {
        return { type: "group", id: decodeURIComponent(params.entityId) };
      }
      return { type: params.entityType, id: Number(params.entityId) };
    }
    return pickInitialSidebarEntity(exploration?.threads);
  }, [params.entityType, params.entityId, exploration]);

  // Auto-insights generates its document asynchronously: the FE shows a
  // placeholder "Analysis underway…" Document while the worker runs, and
  // the worker UPDATES that same Document in place when generation
  // finishes. Polling the exploration is enough to see the thread's
  // `completed_at` flip, but the cached document body (served by RTKQ's
  // `getDocument`) is independent of that response — so a user already
  // viewing the auto-insights doc would otherwise keep seeing the
  // placeholder until they hard-refreshed. Watch for the null → non-null
  // transition on `completed_at` for each thread and:
  //   1. Invalidate the Automatic Insights document tag. RTKQ refetches
  //      the body for an active subscription (the open editor) and marks
  //      inactive cache entries stale.
  //   2. Always surface a toast that the analysis is ready — even when the
  //      user is currently viewing the placeholder, since the swap happens
  //      via a cache refetch and is otherwise easy to miss. When the user
  //      is already on the doc the toast omits the `View` action (no place
  //      to go).
  const prevThreadCompletedAt = useRef<Map<number, string | null>>(new Map());
  useEffect(() => {
    const threads = exploration?.threads;
    if (!threads) {
      return;
    }
    for (const thread of threads) {
      const prev = prevThreadCompletedAt.current.get(thread.id);
      const justCompleted = prev === null && thread.completed_at != null;
      prevThreadCompletedAt.current.set(thread.id, thread.completed_at);
      if (!justCompleted) {
        continue;
      }
      const autoDoc = thread.documents?.find(
        (d) => d.name === AUTO_INSIGHTS_DOCUMENT_NAME,
      );
      if (!autoDoc) {
        continue;
      }
      dispatch(Api.util.invalidateTags([idTag("document", autoDoc.id)]));
      const viewingThisDoc =
        selectedEntityId?.type === "document" &&
        selectedEntityId.id === autoDoc.id;
      sendToast({
        icon: "document",
        message: t`Automatic Insights ready`,
        ...(viewingThisDoc
          ? {}
          : {
              actionLabel: t`View`,
              action: () =>
                setSelectedEntityId({ type: "document", id: autoDoc.id }),
            }),
      });
    }
  }, [exploration, dispatch, selectedEntityId, sendToast, setSelectedEntityId]);

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

  // Queries belonging to the currently-selected entity. Drives both the
  // marker (which timelines are interesting) and the auto-default (which
  // timeline to pre-select when the user hasn't picked one for this
  // thread yet). Group views aggregate across all of the group's queries.
  const entityQueries: ExplorationQuery[] = useMemo(() => {
    if (selectedQuery) {
      return [selectedQuery];
    }
    if (selectedGroup) {
      return selectedGroup.queries;
    }
    return [];
  }, [selectedQuery, selectedGroup]);

  const availableTimelineIds: ReadonlySet<TimelineId> = useMemo(
    () => new Set(availableTimelines.map((t) => t.id)),
    [availableTimelines],
  );

  const interestingTimelineIds: ReadonlySet<TimelineId> = useMemo(
    () => getInterestingTimelineIds(entityQueries),
    [entityQueries],
  );

  const selectedTimelineId: TimelineId | null = useMemo(() => {
    if (!effectiveSelectedThread) {
      return null;
    }
    const param = location.query?.[TIMELINE_QUERY_PARAM];
    if (param === NO_TIMELINE_PARAM) {
      return null;
    }
    if (typeof param === "string" && param !== "") {
      const num = Number(param);
      if (Number.isFinite(num) && availableTimelineIds.has(num)) {
        return num;
      }
    }
    return getMostInterestingTimelineId(entityQueries, availableTimelineIds);
  }, [
    effectiveSelectedThread,
    location.query,
    entityQueries,
    availableTimelineIds,
  ]);

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
      // Update the `timeline` URL query param while preserving the
      // path and any other params already on the URL. `null` becomes
      // the `NO_TIMELINE_PARAM` sentinel so we can tell an explicit
      // user-clear apart from "no choice yet" (auto-default).
      const search = new URLSearchParams(location.search ?? "");
      search.set(
        TIMELINE_QUERY_PARAM,
        timelineId == null ? NO_TIMELINE_PARAM : String(timelineId),
      );
      const searchString = search.toString();
      dispatch(
        push(`${location.pathname}${searchString ? `?${searchString}` : ""}`),
      );
    },
    [dispatch, location.pathname, location.search],
  );

  const isCommentsSidebarOpen = Boolean(children);

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (!exploration) {
    return null;
  }

  return (
    <Group
      pl="2.25rem"
      h="100%"
      w="100%"
      bg="background-secondary"
      align="flex-start"
      wrap="nowrap"
      gap={0}
      data-test-id="exploration-page"
    >
      <ExplorationSidebar
        exploration={exploration}
        selectedEntityId={selectedEntityId}
        setSelectedEntityId={setSelectedEntityId}
      />
      {selectedThread && selectedQuery && (
        <ExplorationVisualization
          explorationQuery={selectedQuery}
          explorationThread={selectedThread}
          availableTimelines={availableTimelines}
          selectedTimelineId={selectedTimelineId}
          onSelectTimelineId={handleSelectTimelineId}
          timelineEvents={timelineEvents}
          interestingTimelineIds={interestingTimelineIds}
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
          interestingTimelineIds={interestingTimelineIds}
        />
      )}
      {selectedDocument && (
        <ExplorationDocumentComponent
          document={selectedDocument}
          isCommentsSidebarOpen={isCommentsSidebarOpen}
          childTargetId={params.childTargetId}
          route={route}
        />
      )}
      {isCommentsSidebarOpen && <Box bg="background-primary">{children}</Box>}
    </Group>
  );
}
