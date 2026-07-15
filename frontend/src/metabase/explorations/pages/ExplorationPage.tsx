import type { Location } from "history";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrevious } from "react-use";

import {
  useGetExplorationQuery,
  useListCommentsQuery,
  useListTimelinesQuery,
} from "metabase/api";
import { getListCommentsQuery } from "metabase/comments/utils";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { useDispatch } from "metabase/redux";
import { push } from "metabase/router";
import { Group, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import type {
  Exploration,
  ExplorationPageNode,
  ExplorationPageNodeId,
  ExplorationQuery,
  ExplorationThread,
  Timeline,
  TimelineId,
} from "metabase-types/api";
import { isSettledExplorationQueryStatus } from "metabase-types/api";

import {
  ExplorationSidebar,
  ExplorationTitle,
} from "../components/ExplorationSidebar";
import {
  type ExplorationTreeNode,
  getExplorationSidebarTabsInfo,
  getExplorationSidebarTree,
  isHiddenTreeItem,
  pickInitialSidebarEntity,
} from "../components/ExplorationSidebar/utils";
import {
  ExplorationChartAreaSkeleton,
  ExplorationGroupVisualization,
} from "../components/ExplorationVisualization";
import type { CommentDrafts } from "../components/ExplorationVisualization/ActionToolbar";
import { getMostInterestingTimelineId } from "../components/ExplorationVisualization/utils";
import { setCurrentExploration } from "../explorations.slice";
import { type ExplorationSidebarTab, isExplorationSidebarTab } from "../types";
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
    entityType?: "page";
    entityId?: string;
  };
  location: Location<ExplorationPageQuery>;
}

function hasUnsettledQueries(exploration: Exploration | undefined): boolean {
  if (!exploration?.threads) {
    return false;
  }
  // Keep polling while either:
  //   (a) any individual query is still running, OR
  //   (b) the thread has been started but isn't fully complete yet — the
  //       backend only sets `completed_at` once its post-query handling
  //       finishes, and we want the sidebar to pick up that final state via
  //       a poll refresh. Draft threads (no `started_at`) don't trigger
  //       polling — they have nothing in flight.
  return exploration.threads.some(
    (thread) =>
      thread.queries?.some((q) => !isSettledExplorationQueryStatus(q.status)) ||
      (thread.started_at != null && thread.completed_at == null),
  );
}

interface SelectedPageId {
  type: "page";
  id: ExplorationPageNodeId;
}

export type SelectedEntityId = SelectedPageId;

export function ExplorationPage({ params, location }: ExplorationPageProps) {
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

  const getSelectedEntityIdUrl = useCallback(
    (entityId: SelectedEntityId) => {
      return `${Urls.exploration(parseInt(params.id, 10))}/${entityId.type}/${encodeURIComponent(entityId.id)}${location.search}`;
    },
    [params.id, location.search],
  );

  const setSelectedEntityId = useCallback(
    (entityId: SelectedEntityId) => {
      dispatch(push(getSelectedEntityIdUrl(entityId)));
    },
    [dispatch, getSelectedEntityIdUrl],
  );

  // Poll the exploration while any query is still in a non-terminal state.
  // RTK Query reads `pollingInterval` on every render, so deriving it from
  // the response is enough — passing 0 stops polling.
  const [shouldPoll, setShouldPoll] = useState(true);
  const [commentDrafts, setCommentDrafts] = useState<CommentDrafts>({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showHidden, setShowHidden] = useState(false);

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
    return getExplorationSidebarTree(exploration, treeItemFilter);
  }, [exploration, selectedSidebarTab, explorationSidebarTabsInfo, showHidden]);

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
      return { type: "page", id: decodeURIComponent(params.entityId) };
    }
    return pickInitialSidebarEntity(tree);
  }, [params.entityType, params.entityId, tree]);

  const pageIdToPageAndQueries: Map<
    ExplorationPageNodeId,
    {
      page: ExplorationPageNode;
      thread: ExplorationThread;
      queries: ExplorationQuery[];
    }
  > = useMemo(() => {
    const map = new Map<
      ExplorationPageNodeId,
      {
        page: ExplorationPageNode;
        thread: ExplorationThread;
        queries: ExplorationQuery[];
      }
    >();
    for (const thread of exploration?.threads ?? []) {
      const queriesById = new Map((thread.queries ?? []).map((q) => [q.id, q]));
      for (const block of thread.blocks ?? []) {
        for (const page of block.pages) {
          const queries = page.query_ids
            .map((id) => queriesById.get(id))
            .filter((q): q is ExplorationQuery => q !== undefined);
          map.set(String(page.id), { page, thread, queries });
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

  const isCommentsSidebarOpen = location.query?.comments === "true";
  const wasCommentsSidebarOpen = usePrevious(isCommentsSidebarOpen);

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
            selectedEntityId={selectedEntityId}
            setSelectedEntityId={setSelectedEntityId}
            getSelectedEntityIdUrl={getSelectedEntityIdUrl}
            isOpen={isSidebarOpen}
            showHidden={showHidden}
            onToggleShowHidden={() => setShowHidden((prev) => !prev)}
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
              availableTimelines={availableTimelines}
              selectedTimelineId={selectedTimelineId}
              onSelectTimelineId={handleSelectTimelineId}
              commentDrafts={commentDrafts}
              setCommentDrafts={setCommentDrafts}
              isCommentsSidebarOpen={isCommentsSidebarOpen}
              wasCommentsSidebarOpen={wasCommentsSidebarOpen ?? false}
            />
          )}
          {!selectedPage && hasUnsettledQueries(exploration) && (
            <ExplorationChartAreaSkeleton />
          )}
        </Group>
      </Stack>
    </Group>
  );
}
