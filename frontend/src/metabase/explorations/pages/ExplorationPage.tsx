import type { Location } from "history";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "react-router";
import { t } from "ttag";

import { useGetExplorationQuery, useListTimelinesQuery } from "metabase/api";
import { Api } from "metabase/api/api";
import { idTag } from "metabase/api/tags";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useToast } from "metabase/common/hooks";
import { useDispatch } from "metabase/redux";
import { Box, Group, Stack } from "metabase/ui";
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
import { useExplorationUrl } from "../hooks/use-exploration-url";

const QUERY_POLL_INTERVAL_MS = 2000;

export const NO_TIMELINE_PARAM = "none";
export const TIMELINE_QUERY_PARAM = "timeline";

export const GROUP_QUERY_PARAM = "group";

interface ExplorationPageQuery {
  [TIMELINE_QUERY_PARAM]?: string;
  [GROUP_QUERY_PARAM]?: string;
}

export interface ExplorationPageProps {
  params: {
    id: string;
    entityType?: "document";
    entityId?: string;
    childTargetId?: string;
  };
  route: Route;
  location: Location<ExplorationPageQuery>;
  children?: React.ReactNode;
}

interface SelectedGroups {
  type: "group";
  ids: ExplorationQueryGroupId[];
}

interface SelectedDocument {
  type: "document";
  id: DocumentId;
}

export type SelectedEntity = SelectedGroups | SelectedDocument;

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

export function ExplorationPage({
  params,
  route,
  location,
  children,
}: ExplorationPageProps) {
  const dispatch = useDispatch();

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

  const {
    selectedEntity,
    setSelectedEntity,
    selectedTimelineId,
    setSelectedTimelineId,
  } = useExplorationUrl({
    exploration,
    params,
    location,
  });

  const { data: allTimelines = [] } = useListTimelinesQuery({
    include: "events",
  });

  const allTimelinesById: Map<TimelineId, Timeline> = useMemo(() => {
    return new Map(allTimelines.map((timeline) => [timeline.id, timeline]));
  }, [allTimelines]);

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
        selectedEntity?.type === "document" && selectedEntity.id === autoDoc.id;
      sendToast({
        icon: "document",
        message: t`Automatic Insights ready`,
        ...(viewingThisDoc
          ? {}
          : {
              actionLabel: t`View`,
              action: () =>
                setSelectedEntity({ type: "document", id: autoDoc.id }),
            }),
      });
    }
  }, [exploration, dispatch, selectedEntity, sendToast, setSelectedEntity]);

  const queryIdToQuery: Map<ExplorationQueryId, ExplorationQuery> =
    useMemo(() => {
      return new Map(
        exploration?.threads?.flatMap(
          (thread) => thread.queries?.map((query) => [query.id, query]) ?? [],
        ) ?? [],
      );
    }, [exploration]);

  const groupIdToQueries: Map<ExplorationQueryGroupId, ExplorationQuery[]> =
    useMemo(() => {
      return new Map(
        (exploration?.threads ?? []).flatMap((thread) =>
          (thread.groups ?? []).map((group) => [
            group.id,
            group.query_ids
              .map((id) => queryIdToQuery.get(id))
              .filter((q) => q != null),
          ]),
        ),
      );
    }, [exploration, queryIdToQuery]);

  const selectedQueries = useMemo(() => {
    return selectedEntity?.type === "group"
      ? selectedEntity.ids.flatMap((id) => groupIdToQueries.get(id) ?? [])
      : undefined;
  }, [selectedEntity, groupIdToQueries]);

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
    return selectedEntity?.type === "document"
      ? documentIdToDocument.get(selectedEntity.id)
      : undefined;
  }, [selectedEntity, documentIdToDocument]);

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
        selectedEntity={selectedEntity}
        setSelectedEntity={setSelectedEntity}
      />
      {selectedQueries && (
        <ExplorationVisualization
          explorationQueries={selectedQueries}
          //explorationThread={selectedThread}
          availableTimelines={[]}
          selectedTimelineId={selectedTimelineId}
          onSelectTimelineId={setSelectedTimelineId}
          timelineEvents={[]}
          //interestingTimelineIds={interestingTimelineIds}
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
