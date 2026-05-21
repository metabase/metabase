import { useMemo } from "react";
import { t } from "ttag";

import { useGetExplorationQueryResultQuery } from "metabase/api/exploration";
import { Box, Ellipsified, Group, Icon, Stack, Text } from "metabase/ui";
import { getColorsForValues } from "metabase/ui/colors/charts";
import { isCartesianChart } from "metabase/visualizations";
import Visualization from "metabase/visualizations/components/Visualization";
import { LEGEND_ITEM_FONT_SIZE } from "metabase/visualizations/components/legend/LegendItem.styled";
import type {
  CardId,
  Exploration,
  ExplorationQuery,
  ExplorationQueryGroup,
  ExplorationThread,
  ExplorationThreadMetric,
  SingleSeries,
  Timeline,
  TimelineEvent,
  TimelineId,
} from "metabase-types/api";
import { isSettledExplorationQueryStatus } from "metabase-types/api";

import { ExplorationChartSkeleton } from "./ExplorationChartSkeleton";
import S from "./ExplorationVisualization.module.css";
import { ExplorationVisualizationHeader } from "./ExplorationVisualizationHeader";
import { buildSeriesGroups, getHeatMapSeries } from "./utils";

interface ExplorationGroupVisualizationProps {
  group: ExplorationQueryGroup;
  queries: ExplorationQuery[];
  explorationThread: ExplorationThread;
  availableTimelines: Timeline[];
  selectedTimelineId: TimelineId | null;
  onSelectTimelineId: (timelineId: TimelineId | null) => void;
  timelineEvents: TimelineEvent[];
  interestingTimelineIds?: ReadonlySet<TimelineId>;
  exploration: Exploration;
}

const STACK_PANEL_HEIGHT = 64;

export function ExplorationGroupVisualization(
  props: ExplorationGroupVisualizationProps,
) {
  return (
    <Stack
      flex={1}
      h="100%"
      mih={0}
      py="3rem"
      pr="3rem"
      align="center"
      style={{ overflowY: "auto" }}
    >
      <Stack
        flex={1}
        w="100%"
        bg="background-primary"
        bd="1px solid border"
        bdrs="md"
        p="lg"
      >
        <ExplorationGroupVisualizationBody {...props} />
      </Stack>
    </Stack>
  );
}

function ExplorationGroupVisualizationBody(
  props: ExplorationGroupVisualizationProps,
) {
  const { group, queries } = props;
  const groupName = group.name ?? t`Group`;

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

  if (queries.some((q) => !isSettledExplorationQueryStatus(q.status))) {
    return (
      <ExplorationChartSkeleton
        name={groupName}
        explorationQuery={queries[0]}
      />
    );
  }

  return <ExplorationGroupVisualizationChart {...props} />;
}

function ExplorationGroupVisualizationChart({
  group,
  queries,
  explorationThread,
  availableTimelines,
  selectedTimelineId,
  onSelectTimelineId,
  timelineEvents,
  interestingTimelineIds,
  exploration,
}: ExplorationGroupVisualizationProps) {
  // One RTKQ hook per query. ESLint complains about hooks-in-a-loop;
  // safe here because the parent keys this component on `group.id`, so
  // `queries` length is stable for the lifetime of a single mount.
  // RTKQ caches each per-query result for 30 minutes, so revisiting a
  // `page` group is instant.
  /* eslint-disable react-hooks/rules-of-hooks */
  const datasetQueries = queries.map((q) =>
    useGetExplorationQueryResultQuery(q.id),
  );
  /* eslint-enable react-hooks/rules-of-hooks */

  const groupName = group.name ?? t`Group`;

  // Extract the identity-stable dataset references so they can be
  // individually tracked in the useMemo dependency array below.
  const datasets = datasetQueries.map((q) => q.currentData);

  const metricsById: Map<CardId, ExplorationThreadMetric> = useMemo(() => {
    return new Map(
      (exploration?.threads ?? []).flatMap((thread) =>
        (thread.metrics ?? []).map((metric) => [metric.card_id, metric]),
      ),
    );
  }, [exploration]);

  const queryColors = useMemo(
    () => getColorsForValues(queries.map((q) => String(q.id))),
    [queries],
  );

  const seriesGroups = useMemo(() => {
    const filteredDatasets = datasets.filter((d) => d !== undefined);
    if (filteredDatasets.length < datasets.length) {
      return undefined;
    }
    return buildSeriesGroups({
      queries,
      datasets: filteredDatasets,
      metricsById,
      queryColors,
    });
    // datasets is reconstructed every render but its identity-stable
    // entries make this safe; including the array directly would cause
    // an unstable dep warning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queries, metricsById, queryColors, ...datasets]);

  const showTimelineDropdown = useMemo(() => {
    return seriesGroups?.some((group) => group.isTimeseries);
  }, [seriesGroups]);

  if (!seriesGroups) {
    return (
      <ExplorationChartSkeleton
        name={groupName}
        explorationQuery={queries[0]}
      />
    );
  }

  return (
    <>
      <ExplorationVisualizationHeader
        name={groupName}
        explorationThread={explorationThread}
        availableTimelines={availableTimelines}
        selectedTimelineId={selectedTimelineId}
        onSelectTimelineId={onSelectTimelineId}
        showTimelineDropdown={showTimelineDropdown}
        showDocumentMenu
        groupQueries={queries}
        interestingTimelineIds={interestingTimelineIds}
      />
      {seriesGroups.map(({ series, stackCount }) =>
        isCartesianChart(series[0].card.display) ? (
          <ExplorationCartesianChart
            key={series[0].card.id}
            series={series}
            timelineEvents={timelineEvents}
            stackCount={stackCount}
          />
        ) : series[0].card.display === "table" ? (
          <ExplorationHeatMap key={series[0].card.id} series={series} />
        ) : (
          <ExplorationMap
            key={series[0].card.id}
            series={series}
            queryColors={queryColors}
          />
        ),
      )}
    </>
  );
}

interface ExplorationCartesianChartProps {
  series: SingleSeries[];
  timelineEvents: TimelineEvent[];
  stackCount?: number;
}

function ExplorationCartesianChart({
  series,
  timelineEvents,
  stackCount,
}: ExplorationCartesianChartProps) {
  return (
    <Box flex={1} mih={stackCount ? stackCount * STACK_PANEL_HEIGHT : "10rem"}>
      <Visualization
        rawSeries={series}
        timelineEvents={timelineEvents}
        className={S.chart}
      />
    </Box>
  );
}

interface ExplorationHeatMapProps {
  series: SingleSeries[];
}

function ExplorationHeatMap({ series }: ExplorationHeatMapProps) {
  const combinedSeries = getHeatMapSeries({ series });
  return (
    <Box flex={1} mih="10rem">
      <Visualization rawSeries={[combinedSeries]} className={S.chart} />
    </Box>
  );
}

interface ExplorationMapProps {
  series: SingleSeries[];
  queryColors: Record<string, string>;
}

function ExplorationMap({ series, queryColors }: ExplorationMapProps) {
  return (
    <Stack key={series[0].card.id} gap="md" flex={1}>
      {series.length > 1 && (
        <Group gap="0.75rem" wrap="nowrap" role="list" aria-label={t`Legend`}>
          {series.map((s) => {
            const color = queryColors[s.card.id];
            return (
              <Group
                key={s.card.id}
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
                  {s.card.name}
                </Ellipsified>
              </Group>
            );
          })}
        </Group>
      )}
      {series.map((s) => (
        <Box key={s.card.id} flex={1} mih="10rem">
          <Visualization rawSeries={[s]} className={S.chart} />
        </Box>
      ))}
    </Stack>
  );
}
