import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { shallowEqual } from "react-redux";
import { t } from "ttag";
import { noop } from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import { explorationApi } from "metabase/api/exploration";
import { Warnings } from "metabase/common/components/Warnings";
import { HEADER_HEIGHT, ROW_HEIGHT } from "metabase/data-grid/constants";
import { useDispatch, useSelector } from "metabase/redux";
import type { State } from "metabase/redux/store";
import {
  Box,
  Ellipsified,
  Group,
  Icon,
  type IconProps,
  Stack,
  Text,
} from "metabase/ui";
import { is403Error } from "metabase/utils/errors";
import Visualization from "metabase/visualizations/components/Visualization";
import { LEGEND_ITEM_FONT_SIZE } from "metabase/visualizations/components/legend/LegendItem.styled";
import type { ClickActionsMode, OnBrush } from "metabase/visualizations/types";
import { type HighlightedObject, isCartesianChart } from "metabase/viz-core";
import type {
  ExplorationId,
  ExplorationPageNode,
  ExplorationQuery,
  HydratedExplorationExploreFilter,
  SingleSeries,
  Timeline,
  TimelineEvent,
  TimelineEventId,
  TimelineId,
} from "metabase-types/api";
import { isSettledExplorationQueryStatus } from "metabase-types/api";

import { useExplorationClickActionsMode } from "../../hooks/useExplorationClickActionsMode";
import { getHighlightedForChildTarget } from "../../selectors";
import type { CommentDrafts } from "../../types";

import { ActionToolbar } from "./ActionToolbar";
import { ExplorationChartSkeleton } from "./ExplorationChartSkeleton";
import { ExplorationComments } from "./ExplorationComments";
import S from "./ExplorationGroupVisualization.module.css";
import { ExplorationVisualizationHeader } from "./ExplorationVisualizationHeader";
import { TimelineEventsSidebar } from "./TimelineEventsSidebar";
import {
  type LegendItem,
  buildSeriesGroup,
  composeChartsForGroup,
  resolveHighlightForSeries,
} from "./utils";

interface ExplorationGroupVisualizationProps {
  explorationId: ExplorationId;
  page: ExplorationPageNode;
  queries: ExplorationQuery[];
  exploreFilters?: HydratedExplorationExploreFilter[] | null;
  availableTimelines: Timeline[];
  selectedTimelineId: TimelineId | null;
  onSelectTimelineId: (timelineId: TimelineId | null) => void;
  timelineEvents: TimelineEvent[];
  commentDrafts: CommentDrafts;
  setCommentDrafts: Dispatch<SetStateAction<CommentDrafts>>;
  isCommentsSidebarOpen: boolean;
  wasCommentsSidebarOpen: boolean;
  onCloseCommentsSidebar: () => void;
  canAddToSummary?: boolean;
  setSelectedSummary: (options?: { scrollIntoView?: boolean }) => void;
  onPreviousPage?: () => void;
  onNextPage?: () => void;
}

interface ExplorationGroupVisualizationWithGroupNameProps extends ExplorationGroupVisualizationProps {
  groupName: string;
}

export function ExplorationGroupVisualization(
  props: ExplorationGroupVisualizationProps,
) {
  const groupName = props.page.long_name ?? props.page.name ?? "";

  return (
    <Box flex={1} h="100%" pb="3rem" pr="1rem">
      <Box bg="background-primary" bd="1px solid border" bdrs="sm" h="100%">
        <ErrorBoundary
          errorComponent={() => (
            <Message
              groupName={groupName}
              message={t`Something’s gone wrong.`}
              iconProps={{ name: "warning", c: "error", size: 32 }}
            />
          )}
        >
          <ExplorationGroupVisualizationBody groupName={groupName} {...props} />
        </ErrorBoundary>
      </Box>
    </Box>
  );
}

function ExplorationGroupVisualizationBody(
  props: ExplorationGroupVisualizationWithGroupNameProps,
) {
  const { groupName, queries } = props;

  if (queries.length === 0) {
    // Defensive: a `page` group should always carry queries, but if BE
    // shape ever drifts, render a friendly empty state instead of crashing.
    return (
      <Message groupName={groupName} message={t`No charts in this group.`} />
    );
  }

  if (queries.some((q) => q.status === "error")) {
    return (
      <Message
        groupName={groupName}
        message={t`We couldn't generate one or more of these charts.`}
        iconProps={{ name: "warning", c: "error" }}
      />
    );
  }

  if (queries.some((q) => q.status === "canceled")) {
    return (
      <Message
        groupName={groupName}
        message={t`Research was stopped.`}
        iconProps={{ name: "octagon_alert", c: "icon-primary" }}
      />
    );
  }

  if (queries.some((q) => !isSettledExplorationQueryStatus(q.status))) {
    return <ExplorationChartSkeleton name={groupName} />;
  }

  return (
    <ExplorationGroupVisualizationChart {...props} groupName={groupName} />
  );
}

function ExplorationGroupVisualizationChart({
  explorationId,
  page,
  queries,
  exploreFilters,
  availableTimelines,
  selectedTimelineId,
  onSelectTimelineId,
  timelineEvents,
  groupName,
  commentDrafts,
  setCommentDrafts,
  isCommentsSidebarOpen,
  wasCommentsSidebarOpen,
  onCloseCommentsSidebar,
  canAddToSummary = false,
  setSelectedSummary,
  onPreviousPage,
  onNextPage,
}: ExplorationGroupVisualizationWithGroupNameProps) {
  const dispatch = useDispatch();

  const queryIds = useMemo(() => queries.map((q) => q.id), [queries]);
  const queriesById = useMemo(
    () => Object.fromEntries(queries.map((query) => [query.id, query])),
    [queries],
  );

  const clickActionsMode = useExplorationClickActionsMode({
    explorationId,
    pageId: page.id,
    queryType: queries[0].query_type,
    commentDrafts,
    setCommentDrafts,
    seriesQueryIds: queryIds,
    queriesById,
  });

  const pageChildTargetId = String(page.id);

  useEffect(() => {
    const subscriptions = queryIds.map((id) =>
      dispatch(explorationApi.endpoints.getExplorationQueryResult.initiate(id)),
    );
    return () => {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
    };
  }, [queryIds, dispatch]);

  // Build the per-id selectors once per queryIds change — `select(id)` creates
  // a fresh memoized selector on every call, which would defeat its caching if
  // done inside the subscription below.
  const selectDatasetQueries = useMemo(() => {
    const selectors = queryIds.map((id) =>
      explorationApi.endpoints.getExplorationQueryResult.select(id),
    );
    return (state: State) => selectors.map((select) => select(state));
  }, [queryIds]);

  // The mapped array is fresh on every store dispatch, but its entries are
  // RTKQ cache objects with stable identity while their query state is
  // unchanged — shallowEqual keeps unrelated dispatches (polling, toasts,
  // metabot) from re-rendering the whole chart subtree.
  const datasetQueries = useSelector(selectDatasetQueries, shallowEqual);

  const datasets = datasetQueries.map((q) => q.data);
  const datasetError = datasetQueries.find((q) => q.error)?.error;

  const seriesGroup = useMemo(() => {
    const filteredDatasets = datasets.filter((d) => d !== undefined);
    if (filteredDatasets.length !== queries.length) {
      return undefined;
    }
    const queriesWithDatasets = queries.map((q, i) => ({
      ...q,
      dataset: filteredDatasets[i],
    }));
    return buildSeriesGroup({
      queriesWithDatasets,
    });
    // datasets are reconstructed every render but its identity-stable
    // entries make this safe; including the array directly would cause
    // an unstable dep warning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queries, ...datasets]);

  const chartsForSummary = useMemo(() => {
    if (!seriesGroup) {
      return [];
    }
    return composeChartsForGroup(seriesGroup);
  }, [seriesGroup]);

  const showTimelineDropdown = useMemo(() => {
    return (
      seriesGroup?.isTimeseries &&
      availableTimelines.length > 0 &&
      // row doesn't support timelines
      !seriesGroup.series.some((s) => s.card.display === "row")
    );
  }, [seriesGroup, availableTimelines]);

  const highlightedCommentState = useSelector((state) =>
    getHighlightedForChildTarget(state, pageChildTargetId),
  );
  const highlighted = useMemo(
    () =>
      resolveHighlightForSeries(
        highlightedCommentState,
        seriesGroup?.series ?? [],
        seriesGroup?.queryIds ?? [],
        queriesById,
      ),
    [highlightedCommentState, seriesGroup, queriesById],
  );

  const [seeAllEvents, setSeeAllEvents] = useState<TimelineEvent[]>([]);
  useEffect(() => {
    setSeeAllEvents([]);
  }, [selectedTimelineId]);

  useEffect(() => {
    if (isCommentsSidebarOpen) {
      setSeeAllEvents([]);
    }
  }, [isCommentsSidebarOpen]);
  const seeAllEventIds = useMemo(
    () => seeAllEvents.map((event) => event.id),
    [seeAllEvents],
  );
  const closeSeeAllEvents = useCallback(() => setSeeAllEvents([]), []);

  const handleSeeAllEvents = useCallback(
    (events: TimelineEvent[]) => {
      setSeeAllEvents(events);
      onCloseCommentsSidebar();
    },
    [onCloseCommentsSidebar],
  );

  if (!seriesGroup) {
    if (datasetError) {
      if (is403Error(datasetError)) {
        return (
          <Message
            groupName={groupName}
            message={t`You don't have permission to view these results.`}
            iconProps={{ name: "lock", c: "text-secondary" }}
          />
        );
      }
      return (
        <Message
          groupName={groupName}
          message={t`This chart couldn't be loaded.`}
          iconProps={{ name: "warning", c: "error" }}
        />
      );
    }
    return <ExplorationChartSkeleton name={groupName} />;
  }

  const { series, stackCount, legendItems } = seriesGroup;

  if (series.length === 0) {
    return (
      <Message
        groupName={groupName}
        message={t`We couldn't find any data to display.`}
        iconProps={{ name: "warning", c: "error" }}
      />
    );
  }

  return (
    <Group flex={1} gap={0} h="100%">
      <Stack flex={1} p="xl" className={S.chartGridContainer} h="100%">
        <ExplorationVisualizationHeader
          name={groupName}
          exploreFilters={exploreFilters}
          explorationId={explorationId}
          pageId={String(page.id)}
          isCommentsSidebarOpen={isCommentsSidebarOpen}
          showCommentsButton={true}
        />
        <Box className={S.chartGrid} data-testid="exploration-chart-grid">
          {isCartesianChart(series[0].card.display) ? (
            <ExplorationCartesianChart
              key={series[0].card.id}
              series={series}
              timelineEvents={timelineEvents}
              mode={clickActionsMode}
              highlighted={highlighted}
              selectedTimelineEventIds={seeAllEventIds}
              onSeeAllEvents={handleSeeAllEvents}
            />
          ) : series[0].card.display === "table" ? (
            <ExplorationHeatMap
              key={series[0].card.id}
              series={series}
              stackCount={stackCount}
              mode={clickActionsMode}
              highlighted={highlighted}
            />
          ) : (
            <ExplorationMap
              key={series[0].card.id}
              series={series}
              legendItems={legendItems}
              mode={clickActionsMode}
              highlighted={highlighted}
            />
          )}
        </Box>
        <ActionToolbar
          explorationId={explorationId}
          page={page}
          charts={chartsForSummary}
          canAddToSummary={canAddToSummary}
          setSelectedSummary={setSelectedSummary}
          commentDrafts={commentDrafts}
          setCommentDrafts={setCommentDrafts}
          showTimelineDropdown={showTimelineDropdown ?? false}
          availableTimelines={availableTimelines}
          selectedTimelineId={selectedTimelineId}
          onSelectTimelineId={onSelectTimelineId}
          onPreviousPage={onPreviousPage}
          onNextPage={onNextPage}
        />
      </Stack>
      {seeAllEvents.length > 0 && (
        <TimelineEventsSidebar
          events={seeAllEvents}
          onClose={closeSeeAllEvents}
        />
      )}
      {isCommentsSidebarOpen && seeAllEvents.length === 0 && (
        <Box w="23rem" h="100%" className={S.commentsSidebar}>
          <ExplorationComments
            // since ExplorationGroupVisualization is keyed on the page, the panel remounts whenever the page changes
            // but autofocus can steal the focus and prevent keyboard nav from working
            // so we only allow autofocus if the sidebar is truly opening, not just remounting
            disableAutoFocus={wasCommentsSidebarOpen}
            explorationId={explorationId}
            pageId={pageChildTargetId}
            view="page"
            onClose={onCloseCommentsSidebar}
            context={{
              timeline_id: selectedTimelineId ?? undefined,
            }}
            timelines={availableTimelines}
            onSelectTimelineId={onSelectTimelineId}
          />
        </Box>
      )}
    </Group>
  );
}

interface ExplorationCartesianChartProps {
  series: SingleSeries[];
  timelineEvents: TimelineEvent[];
  mode: ClickActionsMode;
  highlighted?: HighlightedObject | null;
  selectedTimelineEventIds: TimelineEventId[];
  onSeeAllEvents: (events: TimelineEvent[]) => void;
}

function ExplorationCartesianChart({
  series,
  timelineEvents,
  mode,
  highlighted,
  selectedTimelineEventIds,
  onSeeAllEvents,
}: ExplorationCartesianChartProps) {
  const handleBrush = useCallback<OnBrush>(
    ({ clickObject, openClickActions }) => {
      openClickActions(clickObject);
    },
    [],
  );

  return (
    <ExplorationVisualization
      rawSeries={series}
      timelineEvents={timelineEvents}
      className={S.chart}
      mode={mode}
      highlighted={highlighted}
      selectedTimelineEventIds={selectedTimelineEventIds}
      onSeeAllEvents={onSeeAllEvents}
      onBrush={handleBrush}
    />
  );
}

interface ExplorationHeatMapProps {
  series: SingleSeries[];
  stackCount?: number;
  mode: ClickActionsMode;
  highlighted?: HighlightedObject | null;
}

function ExplorationHeatMap({
  series,
  stackCount,
  mode,
  highlighted,
}: ExplorationHeatMapProps) {
  const tableHeight = HEADER_HEIGHT + (stackCount ?? 1) * ROW_HEIGHT;
  return (
    <Box h={tableHeight}>
      <ExplorationVisualization
        rawSeries={series}
        className={S.chart}
        mode={mode}
        highlighted={highlighted}
      />
    </Box>
  );
}

interface ExplorationMapProps {
  series: SingleSeries[];
  legendItems: LegendItem[];
  mode: ClickActionsMode;
  highlighted?: HighlightedObject | null;
}

function ExplorationMap({
  series,
  legendItems,
  mode,
  highlighted,
}: ExplorationMapProps) {
  return (
    <Stack gap="lg">
      {legendItems.length > 1 && (
        <Group gap="0.75rem" wrap="nowrap" role="list" aria-label={t`Legend`}>
          {legendItems.map(({ name, color }, i) => {
            return (
              <Group
                key={i}
                gap="xxs"
                align="center"
                wrap="nowrap"
                role="listitem"
                p="0.125rem"
                miw={0}
              >
                <Box
                  aria-hidden
                  w="0.5rem"
                  h="0.5rem"
                  bdrs="50%"
                  flex="none"
                  style={{ background: color }}
                />
                <Ellipsified
                  fw="bold"
                  size="sm"
                  fz={LEGEND_ITEM_FONT_SIZE}
                  lh="normal"
                >
                  {name}
                </Ellipsified>
              </Group>
            );
          })}
        </Group>
      )}
      {series.map((s) => (
        <Box key={s.card.id} flex={1} mih="10rem">
          <ExplorationVisualization
            rawSeries={[s]}
            className={S.chart}
            mode={mode}
            highlighted={highlighted}
          />
        </Box>
      ))}
    </Stack>
  );
}

interface ExplorationVisualizationProps {
  rawSeries: SingleSeries[];
  timelineEvents?: TimelineEvent[];
  className?: string;
  mode?: ClickActionsMode;
  highlighted?: HighlightedObject | null;
  selectedTimelineEventIds?: TimelineEventId[];
  onSeeAllEvents?: (events: TimelineEvent[]) => void;
  onBrush?: OnBrush;
}

export function ExplorationVisualization({
  rawSeries,
  timelineEvents,
  className,
  mode,
  highlighted,
  selectedTimelineEventIds,
  onSeeAllEvents,
  onBrush,
}: ExplorationVisualizationProps) {
  const [warnings, setWarnings] = useState<string[]>([]);

  return (
    <Box w="100%" h="100%" pos="relative">
      <Warnings warnings={warnings} className={S.warnings} size={18} />
      <Visualization
        rawSeries={rawSeries}
        timelineEvents={timelineEvents}
        className={className}
        onUpdateWarnings={setWarnings}
        mode={mode}
        hasColumnReordering
        onChangeCardAndRun={noop} // needed to show ConnectedClickActionsPopover
        highlighted={highlighted}
        selectedTimelineEventIds={selectedTimelineEventIds}
        onSeeAllEvents={onSeeAllEvents}
        onBrush={onBrush}
      />
    </Box>
  );
}

interface MessageProps {
  groupName: string;
  message: string;
  iconProps?: IconProps;
}

function Message({ groupName, message, iconProps }: MessageProps) {
  return (
    <Stack p="xl" h="100%">
      <ExplorationVisualizationHeader name={groupName} />
      <Stack
        align="center"
        justify="center"
        flex={1}
        gap="sm"
        ta="center"
        role="alert"
        aria-live="polite"
      >
        {iconProps && <Icon size={32} {...iconProps} />}
        <Text fw="bold">{message}</Text>
      </Stack>
    </Stack>
  );
}
