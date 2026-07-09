import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { explorationApi } from "metabase/api/exploration";
import { Comments } from "metabase/comments/components/Comments";
import { Warnings } from "metabase/common/components/Warnings";
import { HEADER_HEIGHT, ROW_HEIGHT } from "metabase/data-grid/constants";
import { useDispatch, useSelector } from "metabase/redux";
import {
  Box,
  Ellipsified,
  Group,
  Icon,
  type IconProps,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import { is403Error } from "metabase/utils/errors";
import { isCartesianChart } from "metabase/visualizations";
import Visualization from "metabase/visualizations/components/Visualization";
import { LEGEND_ITEM_FONT_SIZE } from "metabase/visualizations/components/legend/LegendItem.styled";
import type {
  ClickActionsMode,
  ClickObject,
  CustomClickAction,
  HighlightedObject,
} from "metabase/visualizations/types";
import type {
  Comment,
  ExplorationBlockNodeType,
  ExplorationId,
  ExplorationPageNode,
  ExplorationQuery,
  SingleSeries,
  Timeline,
  TimelineId,
} from "metabase-types/api";
import { isSettledExplorationQueryStatus } from "metabase-types/api";

import { ActionToolbar, type CommentDrafts } from "./ActionToolbar";
import { ChartClickPopover } from "./ChartClickPopover";
import { ExplorationChartSkeleton } from "./ExplorationChartSkeleton";
import S from "./ExplorationGroupVisualization.module.css";
import { ExplorationVisualizationHeader } from "./ExplorationVisualizationHeader";
import {
  type LegendItem,
  buildSeriesGroup,
  getCommentLabel,
  getExploreFurtherFilters,
} from "./utils";

interface ExplorationGroupVisualizationProps {
  explorationId: ExplorationId;
  page: ExplorationPageNode;
  queries: ExplorationQuery[];
  blockType: ExplorationBlockNodeType;
  availableTimelines: Timeline[];
  selectedTimelineId: TimelineId | null;
  onSelectTimelineId: (timelineId: TimelineId | null) => void;
  interestingTimelineIds?: ReadonlySet<TimelineId>;
  commentDrafts: CommentDrafts;
  setCommentDrafts: Dispatch<SetStateAction<CommentDrafts>>;
  isCommentsSidebarOpen: boolean;
  wasCommentsSidebarOpen: boolean;
}

interface ExplorationGroupVisualizationWithGroupNameProps extends ExplorationGroupVisualizationProps {
  groupName: string;
}

export function ExplorationGroupVisualization(
  props: ExplorationGroupVisualizationProps,
) {
  const groupName = props.page.name ?? "";

  return (
    <Stack flex={1} h="100%" pb="3rem" pr="1rem" align="center">
      <Box
        flex={1}
        w="100%"
        bg="background-primary"
        bd="1px solid border"
        bdrs="md"
        h="100%"
      >
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
    </Stack>
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
  blockType,
  availableTimelines,
  selectedTimelineId,
  onSelectTimelineId,
  interestingTimelineIds,
  groupName,
  commentDrafts,
  setCommentDrafts,
  isCommentsSidebarOpen,
  wasCommentsSidebarOpen,
}: ExplorationGroupVisualizationWithGroupNameProps) {
  const dispatch = useDispatch();
  const queryIds = useMemo(() => queries.map((q) => q.id), [queries]);

  const [clicked, setClicked] = useState<ClickObject | null>(null);

  const handleVisualizationClick = useCallback(
    (clicked: ClickObject | null) => {
      setClicked(clicked);
    },
    [],
  );

  useEffect(() => {
    const subscriptions = queryIds.map((id) =>
      dispatch(explorationApi.endpoints.getExplorationQueryResult.initiate(id)),
    );
    return () => {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
    };
  }, [queryIds, dispatch]);

  const datasetQueries = useSelector((state) =>
    queryIds.map((id) =>
      explorationApi.endpoints.getExplorationQueryResult.select(id)(state),
    ),
  );

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
      selectedTimelineId,
    });
    // datasets are reconstructed every render but its identity-stable
    // entries make this safe; including the array directly would cause
    // an unstable dep warning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queries, selectedTimelineId, ...datasets]);

  const showTimelineDropdown = useMemo(() => {
    return seriesGroup?.isTimeseries && availableTimelines.length > 0;
  }, [seriesGroup, availableTimelines]);

  const [highlighted, setHighlighted] = useState<HighlightedObject | null>(
    null,
  );

  const renderCommentExtra = useCallback(
    (comment: Comment) => {
      const context = comment.context;

      const highlighted = context?.highlighted as HighlightedObject | undefined;
      const commentLabel = getCommentLabel(highlighted, seriesGroup);

      const timelineId =
        typeof context?.timeline_id === "number"
          ? context.timeline_id
          : undefined;
      const timeline =
        timelineId != null
          ? availableTimelines.find((t) => t.id === timelineId)
          : undefined;

      if (!commentLabel && !timeline) {
        return null;
      }

      return (
        <Group gap="xs" mt="0.375rem" wrap="wrap">
          {commentLabel && (
            <UnstyledButton
              bd="0.5px solid border"
              bdrs="lg"
              py="xs"
              px="sm"
              className={S.commentBadge}
              onMouseEnter={() => {
                if (highlighted) {
                  setHighlighted(highlighted);
                }
              }}
              onMouseLeave={() => setHighlighted(null)}
            >
              <Group gap={4} wrap="nowrap">
                <Icon name="filter" size={12} />
                {commentLabel}
              </Group>
            </UnstyledButton>
          )}
          {timeline && (
            <UnstyledButton
              bd="0.5px solid border"
              bdrs="lg"
              py="xs"
              px="sm"
              c="text-secondary"
              className={S.commentBadge}
              onClick={() => {
                onSelectTimelineId(timelineId ?? null);
              }}
            >
              {timeline.name}
            </UnstyledButton>
          )}
        </Group>
      );
    },
    [availableTimelines, onSelectTimelineId, setHighlighted, seriesGroup],
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
      <Stack flex={1} p="lg" className={S.chartGridContainer} h="100%">
        <ExplorationVisualizationHeader
          name={groupName}
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
              stackCount={stackCount}
              onVisualizationClick={handleVisualizationClick}
              highlighted={highlighted}
            />
          ) : series[0].card.display === "table" ? (
            <ExplorationHeatMap
              key={series[0].card.id}
              series={series}
              stackCount={stackCount}
              onVisualizationClick={handleVisualizationClick}
              highlighted={highlighted}
            />
          ) : (
            <ExplorationMap
              key={series[0].card.id}
              series={series}
              legendItems={legendItems}
              onVisualizationClick={handleVisualizationClick}
              highlighted={highlighted}
            />
          )}
        </Box>
        {clicked && (
          <ChartClickPopover
            explorationId={explorationId}
            page={page}
            clicked={clicked}
            blockType={blockType}
            queryType={queries[0].query_type}
            onClose={() => setClicked(null)}
          />
        )}
        <ActionToolbar
          explorationId={explorationId}
          page={page}
          commentDrafts={commentDrafts}
          setCommentDrafts={setCommentDrafts}
          showTimelineDropdown={showTimelineDropdown ?? false}
          availableTimelines={availableTimelines}
          selectedTimelineId={selectedTimelineId}
          onSelectTimelineId={onSelectTimelineId}
          interestingTimelineIds={interestingTimelineIds}
        />
      </Stack>
      {isCommentsSidebarOpen && (
        <Box w="23rem" h="100%" className={S.commentsSidebar}>
          <Comments
            // since ExplorationGroupVisualization is keyed on the page, Comments remounts whenever the page changes
            // but autofocus can steal the focus and prevent keyboard nav from working
            // so we only allow autofocus is the sidebar is truly opening, not just Comments remounting
            disableAutoFocus={wasCommentsSidebarOpen}
            commentTarget={{
              target_id: explorationId,
              target_type: "exploration",
            }}
            childTargetId={String(page.id)}
            showCloseButton={false}
            context={{
              timeline_id: selectedTimelineId,
            }}
            renderExtra={renderCommentExtra}
          />
        </Box>
      )}
    </Group>
  );
}

interface ExplorationCartesianChartProps {
  series: SingleSeries[];
  stackCount?: number;
  onVisualizationClick?: (clicked: ClickObject | null) => void;
  highlighted?: HighlightedObject | null;
}

function ExplorationCartesianChart({
  series,
  onVisualizationClick,
  highlighted,
}: ExplorationCartesianChartProps) {
  return (
    <ExplorationVisualization
      rawSeries={series}
      className={S.chart}
      onVisualizationClick={onVisualizationClick}
      highlighted={highlighted}
    />
  );
}

interface ExplorationHeatMapProps {
  series: SingleSeries[];
  stackCount?: number;
  onVisualizationClick?: (clicked: ClickObject | null) => void;
  highlighted?: HighlightedObject | null;
}

function ExplorationHeatMap({
  series,
  stackCount,
  onVisualizationClick,
  highlighted,
}: ExplorationHeatMapProps) {
  const tableHeight = HEADER_HEIGHT + (stackCount ?? 1) * ROW_HEIGHT;
  return (
    <Box h={tableHeight}>
      <ExplorationVisualization
        rawSeries={series}
        className={S.chart}
        onVisualizationClick={onVisualizationClick}
        highlighted={highlighted}
      />
    </Box>
  );
}

interface ExplorationMapProps {
  series: SingleSeries[];
  legendItems: LegendItem[];
  onVisualizationClick?: (clicked: ClickObject | null) => void;
  highlighted?: HighlightedObject | null;
}

function ExplorationMap({
  series,
  legendItems,
  onVisualizationClick,
  highlighted,
}: ExplorationMapProps) {
  return (
    <Stack gap="md">
      {legendItems.length > 1 && (
        <Group gap="0.75rem" wrap="nowrap" role="list" aria-label={t`Legend`}>
          {legendItems.map(({ name, color }, i) => {
            return (
              <Group
                key={i}
                gap="xs"
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
            onVisualizationClick={onVisualizationClick}
            highlighted={highlighted}
          />
        </Box>
      ))}
    </Stack>
  );
}

// A drillable point on an exploration chart carries a value we can scope a follow-up
// investigation to. This dummy action never renders — the `handleVisualizationClick` override
// on `Visualization` intercepts the click and opens our own popover — but its presence is what
// makes the cartesian layer treat value-bearing points as clickable and emit the click at all.
const EXPLORE_FURTHER_ACTION: CustomClickAction = {
  name: "explore-further",
  section: "custom",
  type: "custom",
  buttonType: "horizontal",
};

const EXPLORE_CLICK_MODE: ClickActionsMode = {
  actionsForClick: (clicked) =>
    getExploreFurtherFilters(clicked).length > 0
      ? [EXPLORE_FURTHER_ACTION]
      : [],
};

interface ExplorationVisualizationProps {
  rawSeries: SingleSeries[];
  className?: string;
  onVisualizationClick?: (clicked: ClickObject | null) => void;
  highlighted?: HighlightedObject | null;
}

export function ExplorationVisualization({
  rawSeries,
  className,
  onVisualizationClick,
  highlighted,
}: ExplorationVisualizationProps) {
  const [warnings, setWarnings] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <Box w="100%" h="100%" pos="relative" ref={containerRef}>
      <Warnings warnings={warnings} className={S.warnings} size={18} />
      <Visualization
        rawSeries={rawSeries}
        className={className}
        onUpdateWarnings={setWarnings}
        mode={onVisualizationClick ? EXPLORE_CLICK_MODE : undefined}
        handleVisualizationClick={onVisualizationClick}
        highlighted={highlighted}
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
    <Stack p="lg" h="100%">
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
