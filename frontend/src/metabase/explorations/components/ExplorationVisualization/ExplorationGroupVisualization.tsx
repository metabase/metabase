import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { explorationApi } from "metabase/api/exploration";
import { Comments } from "metabase/comments/components/Comments";
import { Warnings } from "metabase/common/components/Warnings";
import { HEADER_HEIGHT, ROW_HEIGHT } from "metabase/data-grid/constants";
import { useDispatch, useSelector } from "metabase/redux";
import { Box, Ellipsified, Group, Icon, Stack, Text } from "metabase/ui";
import { isCartesianChart } from "metabase/visualizations";
import Visualization from "metabase/visualizations/components/Visualization";
import { LEGEND_ITEM_FONT_SIZE } from "metabase/visualizations/components/legend/LegendItem.styled";
import type {
  Comment,
  ExplorationId,
  ExplorationQuery,
  ExplorationQueryGroup,
  ExplorationThread,
  SingleSeries,
  Timeline,
  TimelineId,
} from "metabase-types/api";
import { isSettledExplorationQueryStatus } from "metabase-types/api";

import { ActionToolbar, type CommentDrafts } from "./ActionToolbar";
import { ExplorationChartError } from "./ExplorationChartError";
import { ExplorationChartSkeleton } from "./ExplorationChartSkeleton";
import S from "./ExplorationGroupVisualization.module.css";
import { ExplorationVisualizationHeader } from "./ExplorationVisualizationHeader";
import { type LegendItem, buildSeriesGroups } from "./utils";

interface ExplorationGroupVisualizationProps {
  explorationId: ExplorationId;
  group: ExplorationQueryGroup;
  queries: ExplorationQuery[];
  explorationThread: ExplorationThread;
  availableTimelines: Timeline[];
  selectedTimelineId: TimelineId | null;
  onSelectTimelineId: (timelineId: TimelineId | null) => void;
  interestingTimelineIds?: ReadonlySet<TimelineId>;
  commentDrafts: CommentDrafts;
  setCommentDrafts: Dispatch<SetStateAction<CommentDrafts>>;
  isCommentsSidebarOpen: boolean;
}

const STACK_PANEL_HEIGHT = 64;

function ErrorComponent() {
  return (
    <Stack
      align="center"
      justify="center"
      flex={1}
      gap="sm"
      ta="center"
      role="alert"
      aria-live="polite"
    >
      <Icon name="warning" c="error" size={32} />
      <Text fw="bold">{t`Something’s gone wrong.`}</Text>
    </Stack>
  );
}

export function ExplorationGroupVisualization(
  props: ExplorationGroupVisualizationProps,
) {
  return (
    <Stack flex={1} h="100%" py="3rem" pr="2.25rem" align="center">
      <Stack
        flex={1}
        w="100%"
        bg="background-primary"
        bd="1px solid border"
        bdrs="md"
      >
        <ErrorBoundary errorComponent={ErrorComponent}>
          <ExplorationGroupVisualizationBody {...props} />
        </ErrorBoundary>
      </Stack>
    </Stack>
  );
}

function ExplorationGroupVisualizationBody(
  props: ExplorationGroupVisualizationProps,
) {
  const { group, queries } = props;
  const groupName = queries[0]?.name ?? group.name ?? t`Group`;

  if (queries.length === 0) {
    // Defensive: a `page` group should always carry queries, but if BE
    // shape ever drifts, render a friendly empty state instead of crashing.
    return (
      <>
        <ExplorationVisualizationHeader name={groupName} />
        <Stack
          align="center"
          justify="center"
          flex={1}
          gap="sm"
          ta="center"
          role="status"
          aria-live="polite"
        >
          <Text c="text-secondary">{t`No charts in this group.`}</Text>
        </Stack>
      </>
    );
  }

  if (queries.some((q) => q.status === "error")) {
    return (
      <>
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
          <Icon name="warning" c="error" size={32} />
          <Text fw="bold">{t`We couldn't generate one or more of these charts.`}</Text>
        </Stack>
      </>
    );
  }

  if (queries.some((q) => q.status === "canceled")) {
    return (
      <>
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
          <Icon name="octagon_alert" c="icon-primary" size={32} />
          <Text fw="bold">{t`Research was stopped.`}</Text>
        </Stack>
      </>
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
  group,
  queries,
  availableTimelines,
  selectedTimelineId,
  onSelectTimelineId,
  interestingTimelineIds,
  groupName,
  commentDrafts,
  setCommentDrafts,
  isCommentsSidebarOpen,
}: ExplorationGroupVisualizationProps & { groupName: string }) {
  const dispatch = useDispatch();
  const queryIds = useMemo(() => queries.map((q) => q.id), [queries]);

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

  const { seriesGroups } = useMemo(() => {
    const filteredDatasets = datasets.filter((d) => d !== undefined);
    if (filteredDatasets.length < datasets.length) {
      return {
        seriesGroups: undefined,
      };
    }
    return buildSeriesGroups({
      queries,
      datasets: filteredDatasets,
      selectedTimelineId,
    });
    // datasets are reconstructed every render but its identity-stable
    // entries make this safe; including the array directly would cause
    // an unstable dep warning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queries, selectedTimelineId, ...datasets]);

  const showTimelineDropdown = useMemo(() => {
    return seriesGroups?.some((group) => group.isTimeseries);
  }, [seriesGroups]);

  const CommentTimelineBadge = useCallback(
    (comment: Comment) => {
      const timelineId = comment.context?.timeline_id;
      if (typeof timelineId !== "number") {
        return null;
      }
      const timeline = availableTimelines.find((t) => t.id === timelineId);
      if (!timeline) {
        return null;
      }
      return (
        <Box
          w="fit-content"
          bd="0.5px solid border"
          bdrs="lg"
          py="xs"
          px="sm"
          bg="background-secondary"
          c="text-secondary"
          mt="xs"
        >
          {timeline.name}
        </Box>
      );
    },
    [availableTimelines],
  );

  if (!seriesGroups) {
    if (datasetError) {
      return <ExplorationChartError name={groupName} error={datasetError} />;
    }
    return <ExplorationChartSkeleton name={groupName} />;
  }

  if (seriesGroups.length === 0) {
    return (
      <>
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
          <Icon name="warning" c="error" size={32} />
          <Text fw="bold">{t`We couldn't find any data to display.`}</Text>
        </Stack>
      </>
    );
  }

  return (
    <Group flex={1} align="stretch" gap={0}>
      <Stack flex={1} p="lg" className={S.chartGridContainer}>
        <ExplorationVisualizationHeader
          name={groupName}
          explorationId={explorationId}
          groupId={group.id}
          availableTimelines={availableTimelines}
          selectedTimelineId={selectedTimelineId}
          onSelectTimelineId={onSelectTimelineId}
          showTimelineDropdown={showTimelineDropdown}
          interestingTimelineIds={interestingTimelineIds}
          isCommentsSidebarOpen={isCommentsSidebarOpen}
        />
        <Box className={S.chartGrid} data-testid="exploration-chart-grid">
          {seriesGroups.map(({ series, stackCount, chartLabel, legendItems }) =>
            isCartesianChart(series[0].card.display) ? (
              <ExplorationCartesianChart
                key={series[0].card.id}
                series={series}
                stackCount={stackCount}
                label={chartLabel}
              />
            ) : series[0].card.display === "table" ? (
              <ExplorationHeatMap
                key={series[0].card.id}
                series={series}
                stackCount={stackCount}
                label={chartLabel}
              />
            ) : (
              <ExplorationMap
                key={series[0].card.id}
                series={series}
                label={chartLabel}
                legendItems={legendItems}
              />
            ),
          )}
        </Box>
        <ActionToolbar
          explorationId={explorationId}
          groupId={group.id}
          commentDrafts={commentDrafts}
          setCommentDrafts={setCommentDrafts}
          selectedTimelineId={selectedTimelineId}
        />
      </Stack>
      {isCommentsSidebarOpen && (
        <Box w="23rem" className={S.commentsSidebar}>
          <Comments
            commentTarget={{
              target_id: explorationId,
              target_type: "exploration",
            }}
            childTargetId={group.id}
            showCloseButton={false}
            context={{
              timeline_id: selectedTimelineId,
            }}
            renderExtra={CommentTimelineBadge}
          />
        </Box>
      )}
    </Group>
  );
}

interface ExplorationCartesianChartProps {
  series: SingleSeries[];
  stackCount?: number;
  label?: string;
}

function ExplorationCartesianChart({
  series,
  stackCount,
  label,
}: ExplorationCartesianChartProps) {
  return (
    <Stack
      gap="sm"
      mih={stackCount ? stackCount * STACK_PANEL_HEIGHT : "10rem"}
    >
      {label && <Text size="lg">{label}</Text>}
      <Box flex={1} mih={0}>
        <ExplorationVisualization rawSeries={series} className={S.chart} />
      </Box>
    </Stack>
  );
}

interface ExplorationHeatMapProps {
  series: SingleSeries[];
  stackCount?: number;
  label?: string;
}

function ExplorationHeatMap({
  series,
  stackCount,
  label,
}: ExplorationHeatMapProps) {
  const tableHeight = HEADER_HEIGHT + (stackCount ?? 1) * ROW_HEIGHT;
  return (
    <Stack gap="sm">
      {label && <Text size="lg">{label}</Text>}
      <Box h={tableHeight}>
        <ExplorationVisualization rawSeries={series} className={S.chart} />
      </Box>
    </Stack>
  );
}

interface ExplorationMapProps {
  series: SingleSeries[];
  label?: string;
  legendItems: LegendItem[];
}

function ExplorationMap({ series, label, legendItems }: ExplorationMapProps) {
  return (
    <Stack gap="md">
      {label && <Text size="lg">{label}</Text>}
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
          <ExplorationVisualization rawSeries={[s]} className={S.chart} />
        </Box>
      ))}
    </Stack>
  );
}

interface ExplorationVisualizationProps {
  rawSeries: SingleSeries[];
  className?: string;
}

export function ExplorationVisualization({
  rawSeries,
  className,
}: ExplorationVisualizationProps) {
  const [warnings, setWarnings] = useState<string[]>([]);

  return (
    <Box w="100%" h="100%" pos="relative">
      <Warnings warnings={warnings} className={S.warnings} size={18} />
      <Visualization
        rawSeries={rawSeries}
        className={className}
        onUpdateWarnings={setWarnings}
      />
    </Box>
  );
}
