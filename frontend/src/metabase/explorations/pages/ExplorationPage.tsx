import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePrevious } from "react-use";
import { c, t } from "ttag";

import {
  useGetExplorationQuery,
  useListCommentsQuery,
  useListTimelinesQuery,
} from "metabase/api";
import { explorationApi } from "metabase/api/exploration";
import { getListCommentsQuery } from "metabase/comments/utils";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useToast } from "metabase/common/hooks";
import { useDispatch } from "metabase/redux";
import { useLocation, useNavigate, useParams } from "metabase/router";
import { Group, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import type {
  Exploration,
  ExplorationBlockNode,
  ExplorationPageNode,
  ExplorationPageNodeId,
  ExplorationQuery,
  ExplorationThread,
  Timeline,
  TimelineEvent,
  TimelineId,
} from "metabase-types/api";
import {
  isSettledExplorationQueryStatus,
  isTerminalExplorationThreadStatus,
} from "metabase-types/api";

import {
  ExplorationSidebar,
  ExplorationTitle,
} from "../components/ExplorationSidebar";
import {
  flattenTree,
  getExplorationSidebarModel,
  getExplorationSidebarTabsInfo,
  pickInitialSidebarPage,
} from "../components/ExplorationSidebar/utils";
import {
  ExplorationChartAreaSkeleton,
  ExplorationGroupVisualization,
} from "../components/ExplorationVisualization";
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
import { getAdjacentById } from "../utils";

const QUERY_POLL_INTERVAL_MS = 2000;

const TIMELINE_QUERY_PARAM = "timeline";

type ExplorationPageParams = {
  id: string;
  pageId?: string;
};

// A dead/stalled worker never stamps a terminal state, so a thread could stay "in flight"
// forever. Stop polling (and spinning) once a thread has been running longer than this long.
const STALE_THREAD_THRESHOLD_MS = 10 * 60 * 1000;

function threadHasActiveWork(thread: ExplorationThread): boolean {
  // (a) an individual query is still running, or (b) the thread is started but not yet terminal
  // (the backend stamps completion only after its post-query handling finishes).
  const hasRunningQuery = thread.queries?.some(
    (query) => !isSettledExplorationQueryStatus(query.status),
  );
  const threadInFlight =
    thread.started_at != null &&
    !isTerminalExplorationThreadStatus(thread.status);
  return Boolean(hasRunningQuery) || threadInFlight;
}

// Wall-clock deadline after which each in-flight thread is treated as stalled.
function activeThreadStaleDeadlines(
  exploration: Exploration | undefined,
): number[] {
  return (exploration?.threads ?? [])
    .filter(threadHasActiveWork)
    .map((thread) => {
      const start = new Date(thread.started_at ?? thread.created_at).getTime();
      return start + STALE_THREAD_THRESHOLD_MS;
    });
}

export function ExplorationPage() {
  const params = useParams<ExplorationPageParams>();

  return <ExplorationPageForId key={params.id} />;
}

function ExplorationPageForId() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { id = "", pageId } = useParams<ExplorationPageParams>();
  const params = { id, pageId };
  const location = useLocation();
  const searchParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search],
  );

  const isCommentsSidebarOpen = searchParams.get("comments") === "true";
  const wasCommentsSidebarOpen = usePrevious(isCommentsSidebarOpen);

  const selectedSidebarTab = useMemo<ExplorationSidebarTab>(() => {
    const tab = searchParams.get("tab") ?? undefined;
    if (isExplorationSidebarTab(tab)) {
      return tab;
    }
    return "all";
  }, [searchParams]);

  const getSelectedSidebarTabUrl = useCallback(
    (tab: ExplorationSidebarTab) => {
      const nextSearchParams = new URLSearchParams(location.search);
      nextSearchParams.set("tab", tab);
      return `${location.pathname}?${nextSearchParams.toString()}`;
    },
    [location.pathname, location.search],
  );

  const closeCommentsSidebar = useCallback(() => {
    if (!isCommentsSidebarOpen) {
      return;
    }
    const search = new URLSearchParams(location.search);
    search.delete("comments");
    const query = search.toString();
    navigate(`${location.pathname}${query ? `?${query}` : ""}`);
  }, [isCommentsSidebarOpen, location.search, location.pathname, navigate]);

  const shouldScrollSelectionRef = useRef(true); // initially true to scroll selection from URL into view

  const getSelectedPageUrl = useCallback(
    (
      pageId: ExplorationPageNodeId,
      options?: { tab?: ExplorationSidebarTab },
    ) => {
      const search = new URLSearchParams(location.search);
      if (options?.tab) {
        search.set("tab", options.tab);
      }
      const searchString = search.toString();
      return `${Urls.exploration(parseInt(params.id, 10))}/page/${encodeURIComponent(pageId)}${searchString ? `?${searchString}` : ""}`;
    },
    [params.id, location.search],
  );

  const setSelectedPageId = useCallback(
    (
      pageId: ExplorationPageNodeId,
      options?: { tab?: ExplorationSidebarTab; scrollIntoView?: boolean },
    ) => {
      if (options?.scrollIntoView) {
        shouldScrollSelectionRef.current = true;
      }
      navigate(getSelectedPageUrl(pageId, options));
    },
    [navigate, getSelectedPageUrl],
  );

  // Poll the exploration while any query is still in a non-terminal state.
  // RTK Query reads `pollingInterval` on every render, so deriving it from
  // the response is enough — passing 0 stops polling.
  const [shouldPoll, setShouldPoll] = useState(true);
  const [pollTick, setPollTick] = useState(0);
  const [commentDrafts, setCommentDrafts] = useState<CommentDrafts>({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
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
    dispatch(setCurrentExploration(exploration));
  }, [exploration, dispatch]);

  useEffect(() => {
    const now = Date.now();
    const deadlines = activeThreadStaleDeadlines(exploration).filter(
      (deadline) => deadline > now,
    );
    setShouldPoll(deadlines.length > 0);
    if (deadlines.length === 0) {
      return;
    }
    // Re-evaluate when the soonest thread crosses its stale deadline, even if the polled data
    // hasn't changed — a stalled thread yields referentially-equal responses, so the effect
    // wouldn't otherwise re-run to stop polling.
    const timer = setTimeout(
      () => setPollTick((tick) => tick + 1),
      Math.min(...deadlines) - now + 1,
    );
    return () => clearTimeout(timer);
  }, [exploration, pollTick]);

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

  const { tree, contentMode: sidebarContentMode } = useMemo(() => {
    if (!exploration) {
      return { tree: [], contentMode: "loading" as const };
    }
    return getExplorationSidebarModel({
      exploration,
      selectedSidebarTab,
      tabsInfo: explorationSidebarTabsInfo,
      showHidden,
      sortOrder,
    });
  }, [
    exploration,
    selectedSidebarTab,
    explorationSidebarTabsInfo,
    showHidden,
    sortOrder,
  ]);

  // Selection comes from the URL. When the URL has no page yet
  // (e.g. user landed on `/explorations/:id` directly), fall back to
  // the first query so the sidebar highlight, the scroll anchor, and
  // the right-pane chart all agree on the very first paint — without
  // waiting for the URL-sync effect below to navigate().
  //
  // Once the URL update lands the fallback drops out (params take
  // precedence) and the URL becomes authoritative again.
  // Selection model:
  //
  //   - The URL is the "pinned by the user" indicator. Only user
  //     clicks call `setSelectedPageId`, which pushes the page
  //     into the URL. Once the URL carries a page, that's
  //     authoritative — no more auto-tracking.
  //
  //   - Until then, every render (including ones triggered by polling
  //     bringing in fresh interestingness scores) re-derives the
  //     selection from the current top of the sidebar via
  //     `pickInitialSidebarPage`. This is what makes the right pane
  //     and the sidebar follow the "first, most interesting chart"
  //     as new data lands.
  //
  // We deliberately do NOT push the auto-derived selection into the
  // URL: doing so would freeze the selection at the first auto-pick
  // and prevent it from following subsequent data updates.
  const selectedPageId: ExplorationPageNodeId | null = useMemo(() => {
    if (params.pageId) {
      // Page ids are opaque strings (the page's numeric PK stringified, the
      // same value comments anchor to) — we URL-encode them on push and
      // decode them here.
      return decodeURIComponent(params.pageId);
    }
    return pickInitialSidebarPage(tree);
  }, [params.pageId, tree]);

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

  const prefetchQueryResult = explorationApi.usePrefetch(
    "getExplorationQueryResult",
  );

  const prefetchPage = useCallback(
    (pageId: ExplorationPageNodeId) => {
      const entry = pageIdToPageAndQueries.get(pageId);
      if (!entry) {
        return;
      }
      for (const query of entry.queries) {
        if (query.status === "done") {
          prefetchQueryResult(query.id);
        }
      }
    },
    [pageIdToPageAndQueries, prefetchQueryResult],
  );

  const orderedPages = useMemo(
    () =>
      flattenTree(tree).flatMap((item) =>
        item.data?.type === "page" ? [{ id: item.data.page_id }] : [],
      ),
    [tree],
  );
  const previousPage = getAdjacentById(orderedPages, selectedPageId, -1);
  const nextPage = getAdjacentById(orderedPages, selectedPageId, 1);
  // Undefined when there's nowhere else to go (empty or single-page list).
  const previousPageId =
    previousPage != null && previousPage.id !== selectedPageId
      ? previousPage.id
      : undefined;
  const nextPageId =
    nextPage != null && nextPage.id !== selectedPageId
      ? nextPage.id
      : undefined;

  // Navigate and prefetch the page after the destination in the same
  // direction — once a user pages once they're likely to page again.
  // Both directions wrap around the ordered page list.
  const goToAdjacentPage = useCallback(
    (direction: 1 | -1) => {
      const destination = getAdjacentById(
        orderedPages,
        selectedPageId,
        direction,
      );
      if (destination == null || destination.id === selectedPageId) {
        return;
      }
      setSelectedPageId(destination.id, { scrollIntoView: true });
      const following = getAdjacentById(
        orderedPages,
        destination.id,
        direction,
      );
      if (following != null) {
        prefetchPage(following.id);
      }
    },
    [orderedPages, selectedPageId, setSelectedPageId, prefetchPage],
  );
  const goToPreviousPage = useCallback(
    () => goToAdjacentPage(-1),
    [goToAdjacentPage],
  );
  const goToNextPage = useCallback(
    () => goToAdjacentPage(1),
    [goToAdjacentPage],
  );

  useEffect(() => {
    if (selectedPageId != null && !readPageIds.has(selectedPageId)) {
      setExplorationPageRead(Number(params.id), selectedPageId);
      setReadPageIds((prev) => new Set(prev).add(String(selectedPageId)));
    }
  }, [selectedPageId, readPageIds, params.id]);

  // Detect new threads (from "Explore further") and toast when their first
  // page lands. Threads arrive without pages while query planning is still
  // running, so we wait for a page with queries before marking a thread as seen.
  const seenThreadIdsRef = useRef<Set<number> | null>(null);
  useEffect(() => {
    const threads = exploration?.threads;
    if (!threads) {
      return;
    }

    if (seenThreadIdsRef.current == null) {
      seenThreadIdsRef.current = new Set(threads.map((thread) => thread.id));
      return;
    }

    const seen = seenThreadIdsRef.current;
    for (const thread of threads) {
      if (seen.has(thread.id)) {
        continue;
      }
      const firstPage = thread.blocks?.flatMap((b) =>
        b.pages.filter((p) => p.query_ids.length > 0),
      )?.[0];
      if (!firstPage) {
        continue;
      }
      seen.add(thread.id);
      if (thread.name) {
        sendToast({
          icon: "bolt",
          message: c("{0} is the name of a new research thread")
            .t`Added ${thread.name}`,
          actionLabel: t`View`,
          action: () =>
            setSelectedPageId(String(firstPage.id), {
              tab: "all",
              scrollIntoView: true,
            }),
        });
      }
    }
  }, [exploration, sendToast, setSelectedPageId]);

  const selectedPage = useMemo(() => {
    return selectedPageId != null
      ? pageIdToPageAndQueries.get(selectedPageId)
      : undefined;
  }, [selectedPageId, pageIdToPageAndQueries]);

  const availableTimelines: Timeline[] = useMemo(() => {
    return (
      selectedPage?.thread?.timelines
        ?.map((timeline) => allTimelinesById.get(timeline.timeline_id))
        .filter((timeline) => timeline !== undefined) ?? []
    );
  }, [selectedPage, allTimelinesById]);

  const availableTimelineIds: ReadonlySet<TimelineId> = useMemo(
    () => new Set(availableTimelines.map((t) => t.id)),
    [availableTimelines],
  );

  const selectedTimelineId: TimelineId | null = useMemo(() => {
    if (!selectedPage) {
      return null;
    }
    const param = searchParams.get(TIMELINE_QUERY_PARAM);
    if (param != null && param !== "") {
      const num = Number(param);
      if (Number.isFinite(num) && availableTimelineIds.has(num)) {
        return num;
      }
    }
    return null;
  }, [selectedPage, searchParams, availableTimelineIds]);

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
      const search = new URLSearchParams(location.search ?? "");
      if (timelineId == null) {
        search.delete(TIMELINE_QUERY_PARAM);
      } else {
        search.set(TIMELINE_QUERY_PARAM, String(timelineId));
      }
      const searchString = search.toString();
      navigate(`${location.pathname}${searchString ? `?${searchString}` : ""}`);
    },
    [navigate, location.pathname, location.search],
  );

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
            getSelectedSidebarTabUrl={getSelectedSidebarTabUrl}
            tree={tree}
            selectedPageId={selectedPageId}
            getSelectedPageUrl={getSelectedPageUrl}
            shouldScrollSelectionRef={shouldScrollSelectionRef}
            isOpen={isSidebarOpen}
            readPageIds={readPageIds}
            showHidden={showHidden}
            onToggleShowHidden={() => setShowHidden((prev) => !prev)}
            sortOrder={sortOrder}
            onChangeSortOrder={handleChangeSortOrder}
            contentMode={sidebarContentMode}
            onPreviousPage={goToPreviousPage}
            onNextPage={goToNextPage}
            onPrefetchPage={prefetchPage}
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
              exploreFilters={selectedPage.block.explore_filters}
              availableTimelines={availableTimelines}
              selectedTimelineId={selectedTimelineId}
              onSelectTimelineId={handleSelectTimelineId}
              timelineEvents={timelineEvents}
              commentDrafts={commentDrafts}
              setCommentDrafts={setCommentDrafts}
              isCommentsSidebarOpen={isCommentsSidebarOpen}
              wasCommentsSidebarOpen={wasCommentsSidebarOpen ?? false}
              onCloseCommentsSidebar={closeCommentsSidebar}
              onPreviousPage={
                previousPageId != null ? goToPreviousPage : undefined
              }
              onNextPage={nextPageId != null ? goToNextPage : undefined}
            />
          )}
          {!selectedPage && shouldPoll && <ExplorationChartAreaSkeleton />}
        </Group>
      </Stack>
    </Group>
  );
}
