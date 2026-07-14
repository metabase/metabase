import type { Location } from "history";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePrevious } from "react-use";
import { c, t } from "ttag";

import {
  useGetExplorationQuery,
  useListCommentsQuery,
  useListTimelinesQuery,
} from "metabase/api";
import { Api } from "metabase/api/api";
import { idTag } from "metabase/api/tags";
import { getListCommentsQuery } from "metabase/comments/utils";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { useToast } from "metabase/common/hooks";
import { useDispatch } from "metabase/redux";
import { type Route, push } from "metabase/router";
import { Box, Group, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import type {
  DocumentId,
  Exploration,
  ExplorationBlockNode,
  ExplorationPageNode,
  ExplorationPageNodeId,
  ExplorationQuery,
  ExplorationThread,
  Timeline,
  TimelineId,
} from "metabase-types/api";
import { isSettledExplorationQueryStatus } from "metabase-types/api";

import { trackExplorationAISummaryOpened } from "../analytics";
import {
  ExplorationDocument as ExplorationDocumentComponent,
  type ExplorationDocumentWithIsAiSummary,
} from "../components/ExplorationDocument";
import {
  ExplorationSidebar,
  ExplorationTitle,
} from "../components/ExplorationSidebar";
import {
  type ExplorationTreeNode,
  flattenTree,
  getExplorationSidebarTabsInfo,
  getExplorationSidebarTree,
  isHiddenTreeItem,
  pickInitialSidebarEntity,
} from "../components/ExplorationSidebar/utils";
import {
  ExplorationChartAreaSkeleton,
  ExplorationGroupVisualization,
} from "../components/ExplorationVisualization";
import { getMostInterestingTimelineId } from "../components/ExplorationVisualization/utils";
import { setCurrentExploration } from "../explorations.slice";
import {
  type ExplorationSortOrder,
  getExplorationSortOrder,
  getReadExplorationPageIds,
  setExplorationPageRead,
  setExplorationSortOrder,
} from "../sidebar-preferences";
import {
  type CommentDrafts,
  type ExplorationSidebarTab,
  isExplorationSidebarTab,
} from "../types";
const QUERY_POLL_INTERVAL_MS = 2000;

const NO_TIMELINE_PARAM = "none";
const TIMELINE_QUERY_PARAM = "timeline";

interface ExplorationPageQuery {
  [TIMELINE_QUERY_PARAM]?: string;
  comments?: string;
  tab?: string;
}

interface ExplorationPageProps {
  params: {
    id: string;
    entityType?: "document" | "page";
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
  //       AI Summary handler has written its document. While the handler
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

interface SelectedDocumentId {
  type: "document";
  id: DocumentId;
}

interface SelectedPageId {
  type: "page";
  id: ExplorationPageNodeId;
}

export type SelectedEntityId = SelectedDocumentId | SelectedPageId;

function getFirstThreadPageId(thread: ExplorationThread): string | null {
  const firstPage = (thread.blocks ?? []).flatMap((block) => block.pages)[0];
  return firstPage != null ? String(firstPage.id) : null;
}

export function ExplorationPage({
  params,
  route,
  location,
  children,
}: ExplorationPageProps) {
  const dispatch = useDispatch();

  const selectedSidebarTab = useMemo<ExplorationSidebarTab>(() => {
    const tab = location.query?.tab;
    if (isExplorationSidebarTab(tab)) {
      return tab;
    }
    return "all";
  }, [location.query]);

  const getSelectedSidebarTabUrl = useCallback(
    (tab: ExplorationSidebarTab) => {
      const nextSearchParams = new URLSearchParams(location.search);
      nextSearchParams.set("tab", tab);
      return `${location.pathname}?${nextSearchParams.toString()}`;
    },
    [location.pathname, location.search],
  );

  const shouldScrollSelectionRef = useRef(true); // initially true to scroll selection from URL into view

  const getSelectedEntityIdUrl = useCallback(
    (entityId: SelectedEntityId, options?: { tab?: ExplorationSidebarTab }) => {
      const search = new URLSearchParams(location.search);
      if (options?.tab) {
        search.set("tab", options.tab);
      }
      const searchString = search.toString();
      return `${Urls.exploration(parseInt(params.id, 10))}/${entityId.type}/${encodeURIComponent(entityId.id)}${searchString ? `?${searchString}` : ""}`;
    },
    [params.id, location.search],
  );

  const setSelectedEntityId = useCallback(
    (
      entityId: SelectedEntityId,
      options?: { tab?: ExplorationSidebarTab; scrollIntoView?: boolean },
    ) => {
      if (options?.scrollIntoView) {
        shouldScrollSelectionRef.current = true;
      }
      dispatch(push(getSelectedEntityIdUrl(entityId, options)));
    },
    [dispatch, getSelectedEntityIdUrl],
  );

  // Poll the exploration while any query is still in a non-terminal state.
  // RTK Query reads `pollingInterval` on every render, so deriving it from
  // the response is enough — passing 0 stops polling.
  const [shouldPoll, setShouldPoll] = useState(true);
  const [commentDrafts, setCommentDrafts] = useState<CommentDrafts>({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [hasUnviewedTurnInAll, setHasUnviewedTurnInAll] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [sortOrder, setSortOrder] = useState<ExplorationSortOrder>(() =>
    getExplorationSortOrder(Number(params.id)),
  );
  const [readPageIds, setReadPageIds] = useState<ReadonlySet<string>>(() =>
    getReadExplorationPageIds(Number(params.id)),
  );

  const handleChangeSortOrder = useCallback(
    (order: ExplorationSortOrder) => {
      setSortOrder(order);
      setExplorationSortOrder(Number(params.id), order);
    },
    [params.id],
  );

  const {
    data: exploration,
    isLoading,
    error,
  } = useGetExplorationQuery(Number(params.id), {
    pollingInterval: shouldPoll ? QUERY_POLL_INTERVAL_MS : 0,
  });

  const { data: commentsData } = useListCommentsQuery(
    getListCommentsQuery({
      target_id: Number(params.id),
      target_type: "exploration",
    }),
  );

  useEffect(() => {
    setShouldPoll(hasUnsettledQueries(exploration));
    dispatch(setCurrentExploration(exploration));
  }, [exploration, dispatch]);

  // This is important as it will affect collection breadcrumbs in the appbar
  useEffect(() => {
    return () => {
      dispatch(setCurrentExploration(undefined));
    };
  }, [dispatch]);

  const [sendToast] = useToast();

  const { data: allTimelines = [] } = useListTimelinesQuery({
    include: "events",
  });

  const allTimelinesById: Map<TimelineId, Timeline> = useMemo(() => {
    return new Map(allTimelines.map((timeline) => [timeline.id, timeline]));
  }, [allTimelines]);

  const explorationSidebarTabsInfo = useMemo(() => {
    return getExplorationSidebarTabsInfo(
      exploration,
      commentsData?.comments ?? [],
    );
  }, [exploration, commentsData?.comments]);

  const tree = useMemo(() => {
    if (!exploration) {
      return [];
    }
    const tabFilter =
      explorationSidebarTabsInfo[selectedSidebarTab].treeItemFilter;

    const treeItemFilter = showHidden
      ? tabFilter
      : (node: ITreeNodeItem<ExplorationTreeNode>) =>
          tabFilter(node) && !isHiddenTreeItem(node);
    return getExplorationSidebarTree(exploration, treeItemFilter, sortOrder);
  }, [
    exploration,
    selectedSidebarTab,
    explorationSidebarTabsInfo,
    showHidden,
    sortOrder,
  ]);

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
      // Page ids are opaque strings (the page's numeric PK stringified, the
      // same value comments anchor to) — we URL-encode them on push and
      // decode them here.
      if (params.entityType === "page") {
        return { type: "page", id: decodeURIComponent(params.entityId) };
      }
      return { type: params.entityType, id: Number(params.entityId) };
    }
    return pickInitialSidebarEntity(tree);
  }, [params.entityType, params.entityId, tree]);

  const orderedPageIds = useMemo(
    () =>
      flattenTree(tree).flatMap((item) =>
        item.data?.type === "page" ? [item.data.page_id] : [],
      ),
    [tree],
  );
  const currentPageIndex =
    selectedEntityId?.type === "page"
      ? orderedPageIds.indexOf(selectedEntityId.id)
      : -1;
  const previousPageId =
    currentPageIndex > 0 ? orderedPageIds[currentPageIndex - 1] : undefined;
  const nextPageId =
    currentPageIndex !== -1 && currentPageIndex < orderedPageIds.length - 1
      ? orderedPageIds[currentPageIndex + 1]
      : undefined;
  const goToPreviousPage = useCallback(() => {
    if (previousPageId != null) {
      setSelectedEntityId({ type: "page", id: previousPageId });
    }
  }, [previousPageId, setSelectedEntityId]);
  const goToNextPage = useCallback(() => {
    if (nextPageId != null) {
      setSelectedEntityId({ type: "page", id: nextPageId });
    }
  }, [nextPageId, setSelectedEntityId]);

  useEffect(() => {
    if (
      selectedEntityId?.type === "page" &&
      !readPageIds.has(selectedEntityId.id)
    ) {
      setExplorationPageRead(Number(params.id), selectedEntityId.id);
      setReadPageIds((prev) => new Set(prev).add(String(selectedEntityId.id)));
    }
  }, [selectedEntityId, readPageIds, params.id]);

  // AI Summary generates its document asynchronously: the FE shows a
  // placeholder "Analysis underway…" Document while the worker runs, and
  // the worker UPDATES that same Document in place when generation
  // finishes. Polling the exploration is enough to see the thread's
  // `completed_at` flip, but the cached document body (served by RTKQ's
  // `getDocument`) is independent of that response — so a user already
  // viewing the AI Summary doc would otherwise keep seeing the
  // placeholder until they hard-refreshed. Watch for the null → non-null
  // transition on `completed_at` for each thread and:
  //   1. Invalidate the AI Summary document tag. RTKQ refetches
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
      if (!justCompleted || thread.canceled_at != null) {
        continue;
      }
      const autoDoc = thread.documents?.find(
        (d) => d.id === thread.ai_summary_document_id,
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
        message: c("{0} is the name of the document that is now ready to view")
          .t`${autoDoc.name} ready`,
        ...(viewingThisDoc
          ? {}
          : {
              actionLabel: t`View`,
              action: () => {
                trackExplorationAISummaryOpened(exploration.id);
                setSelectedEntityId({ type: "document", id: autoDoc.id });
              },
            }),
      });
    }
  }, [exploration, dispatch, selectedEntityId, sendToast, setSelectedEntityId]);

  // Navigate to a freshly-started thread on the "All" tab (where it's always visible), landing on
  // its first page.
  const goToTurnInAll = useCallback(
    (thread: ExplorationThread) => {
      const firstPageId = getFirstThreadPageId(thread);
      const nextSearchParams = new URLSearchParams(location.search);
      nextSearchParams.set("tab", "all");
      const base = Urls.exploration(Number(params.id));
      const url =
        firstPageId != null
          ? `${base}/page/${encodeURIComponent(firstPageId)}?${nextSearchParams.toString()}`
          : `${base}?${nextSearchParams.toString()}`;
      dispatch(push(url));
    },
    [dispatch, location.search, params.id],
  );

  const threadIdsRef = useRef<Set<number> | null>(null);
  useEffect(() => {
    const threads = exploration?.threads;
    if (!threads) {
      return;
    }
    if (threadIdsRef.current == null) {
      threadIdsRef.current = new Set(threads.map((thread) => thread.id));
      return;
    }
    const prevThreadIds = threadIdsRef.current;
    const readyNewThreads = threads.filter(
      (thread) =>
        !prevThreadIds.has(thread.id) && getFirstThreadPageId(thread) != null,
    );
    if (readyNewThreads.length === 0) {
      return;
    }
    readyNewThreads.forEach((thread) => prevThreadIds.add(thread.id));
    if (selectedSidebarTab !== "all") {
      setHasUnviewedTurnInAll(true);
    }
    readyNewThreads.forEach((thread) => {
      sendToast({
        icon: "bolt",
        message: thread.name
          ? c("{0} is the name of a new research thread")
              .t`Added ${thread.name}`
          : t`Added new research`,
        actionLabel: t`View`,
        action: () => goToTurnInAll(thread),
      });
    });
  }, [exploration, selectedSidebarTab, sendToast, goToTurnInAll]);

  // Once the user is on the "All" tab the new turn is visible, so drop the dot.
  useEffect(() => {
    if (selectedSidebarTab === "all") {
      setHasUnviewedTurnInAll(false);
    }
  }, [selectedSidebarTab]);

  const tabsWithNewContent = useMemo<ReadonlySet<ExplorationSidebarTab>>(
    () => (hasUnviewedTurnInAll ? new Set(["all"]) : new Set()),
    [hasUnviewedTurnInAll],
  );

  const pageIdToPageAndQueries: Map<
    ExplorationPageNodeId,
    {
      page: ExplorationPageNode;
      thread: ExplorationThread;
      queries: ExplorationQuery[];
      block: ExplorationBlockNode;
    }
  > = useMemo(() => {
    const map = new Map<
      ExplorationPageNodeId,
      {
        page: ExplorationPageNode;
        thread: ExplorationThread;
        queries: ExplorationQuery[];
        block: ExplorationBlockNode;
      }
    >();
    for (const thread of exploration?.threads ?? []) {
      const queriesById = new Map((thread.queries ?? []).map((q) => [q.id, q]));
      for (const block of thread.blocks ?? []) {
        for (const page of block.pages) {
          const queries = page.query_ids
            .map((id) => queriesById.get(id))
            .filter((q): q is ExplorationQuery => q !== undefined);
          map.set(String(page.id), { page, thread, queries, block });
        }
      }
    }
    return map;
  }, [exploration]);

  const selectedPage = useMemo(() => {
    return selectedEntityId?.type === "page"
      ? pageIdToPageAndQueries.get(selectedEntityId.id)
      : undefined;
  }, [selectedEntityId, pageIdToPageAndQueries]);

  const availableTimelines: Timeline[] = useMemo(() => {
    return (
      selectedPage?.thread?.timelines
        ?.map((timeline) => allTimelinesById.get(timeline.timeline_id))
        .filter((timeline) => timeline !== undefined) ?? []
    );
  }, [selectedPage, allTimelinesById]);

  const selectedQueries: ExplorationQuery[] = useMemo(() => {
    if (selectedPage) {
      return selectedPage.queries;
    }
    return [];
  }, [selectedPage]);

  const availableTimelineIds: ReadonlySet<TimelineId> = useMemo(
    () => new Set(availableTimelines.map((t) => t.id)),
    [availableTimelines],
  );

  const selectedTimelineId: TimelineId | null = useMemo(() => {
    if (!selectedPage) {
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
    return getMostInterestingTimelineId(selectedQueries, availableTimelineIds);
  }, [selectedPage, location.query, selectedQueries, availableTimelineIds]);

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

  const documentIdToDocument: Map<
    DocumentId,
    ExplorationDocumentWithIsAiSummary
  > = useMemo(() => {
    return new Map(
      (exploration?.threads ?? []).flatMap((thread) =>
        (thread.documents ?? []).map((document) => [
          document.id,
          {
            ...document,
            isAiSummary: document.id === thread.ai_summary_document_id,
            isCanceled:
              document.id === thread.ai_summary_document_id &&
              thread.canceled_at != null,
          },
        ]),
      ),
    );
  }, [exploration]);

  const selectedDocument = useMemo(() => {
    return selectedEntityId?.type === "document"
      ? documentIdToDocument.get(selectedEntityId.id)
      : undefined;
  }, [selectedEntityId, documentIdToDocument]);

  const isCommentsSidebarOpen = location.query?.comments === "true";
  const wasCommentsSidebarOpen = usePrevious(isCommentsSidebarOpen);
  // documents use a different comments component and URL structure
  const isCommentsSidesheetOpen = Boolean(children);

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (!exploration) {
    return null;
  }

  return (
    <Group h="100%" align="stretch" gap={0}>
      <Stack
        h="100%"
        flex={1}
        bg="background-secondary"
        pl="1.5rem"
        pt="1rem"
        data-test-id="exploration-page"
      >
        <ExplorationTitle
          exploration={exploration}
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
        />
        <Group flex={1} mih={0} align="flex-start" wrap="nowrap" gap={0}>
          <ExplorationSidebar
            exploration={exploration}
            explorationSidebarTabsInfo={explorationSidebarTabsInfo}
            selectedSidebarTab={selectedSidebarTab}
            tabsWithNewContent={tabsWithNewContent}
            getSelectedSidebarTabUrl={getSelectedSidebarTabUrl}
            tree={tree}
            selectedEntityId={selectedEntityId}
            setSelectedEntityId={setSelectedEntityId}
            getSelectedEntityIdUrl={getSelectedEntityIdUrl}
            shouldScrollSelectionRef={shouldScrollSelectionRef}
            isOpen={isSidebarOpen}
            readPageIds={readPageIds}
            showHidden={showHidden}
            onToggleShowHidden={() => setShowHidden((prev) => !prev)}
            sortOrder={sortOrder}
            onChangeSortOrder={handleChangeSortOrder}
          />
          {selectedPage && (
            <ExplorationGroupVisualization
              // Key on page id so the component remounts when the user
              // navigates between pages. The body calls one RTKQ hook per
              // query, so the hook count must be stable for the lifetime of
              // a single mount; remounting on page switch guarantees that.
              key={selectedPage.page.id}
              explorationId={exploration.id}
              page={selectedPage.page}
              queries={selectedPage.queries}
              blockType={selectedPage.block.type}
              availableTimelines={availableTimelines}
              selectedTimelineId={selectedTimelineId}
              onSelectTimelineId={handleSelectTimelineId}
              commentDrafts={commentDrafts}
              setCommentDrafts={setCommentDrafts}
              isCommentsSidebarOpen={isCommentsSidebarOpen}
              wasCommentsSidebarOpen={wasCommentsSidebarOpen ?? false}
              onPreviousPage={
                previousPageId != null ? goToPreviousPage : undefined
              }
              onNextPage={nextPageId != null ? goToNextPage : undefined}
            />
          )}
          {selectedDocument && (
            <ExplorationDocumentComponent
              explorationId={exploration.id}
              document={selectedDocument}
              childTargetId={params.childTargetId}
              route={route}
              locationSearch={location.search}
              isCommentsSidesheetOpen={isCommentsSidesheetOpen}
            />
          )}
          {!selectedPage &&
            !selectedDocument &&
            hasUnsettledQueries(exploration) && (
              <ExplorationChartAreaSkeleton />
            )}
        </Group>
      </Stack>
      {isCommentsSidesheetOpen && <Box bg="background-primary">{children}</Box>}
    </Group>
  );
}
