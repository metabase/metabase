import { useMemo } from "react";
import { t } from "ttag";

import { useGetExplorationQueryResultQuery } from "metabase/api/exploration";
import { HEADER_HEIGHT, ROW_HEIGHT } from "metabase/data-grid/constants";
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

  const { seriesGroups, layoutStrategy } = useMemo(() => {
    const filteredDatasets = datasets.filter((d) => d !== undefined);
    if (filteredDatasets.length < datasets.length) {
      return {
        seriesGroups: undefined,
        layoutStrategy: undefined,
      };
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
      <Box className={S.chartGrid} data-chart-layout={layoutStrategy}>
        {seriesGroups.map(({ series, stackCount, queryType, chartLabel }) =>
          isCartesianChart(series[0].card.display) ? (
            <ExplorationCartesianChart
              key={queryType}
              series={series}
              timelineEvents={timelineEvents}
              stackCount={stackCount}
              label={chartLabel}
            />
          ) : series[0].card.display === "table" ? (
            <ExplorationHeatMap
              key={queryType}
              series={series}
              label={chartLabel}
            />
          ) : (
            <ExplorationMap
              key={queryType}
              series={series}
              queryColors={queryColors}
              label={chartLabel}
            />
          ),
        )}
      </Box>
    </>
  );
}

interface ExplorationCartesianChartProps {
  series: SingleSeries[];
  timelineEvents: TimelineEvent[];
  stackCount?: number;
  label?: string;
}

function ExplorationCartesianChart({
  series,
  timelineEvents,
  stackCount,
  label,
}: ExplorationCartesianChartProps) {
  // The outer Stack is the grid item — height auto so it stretches to the
  // cell. The label takes its natural height; the chart fills whatever is
  // left via `flex={1}`. Without this, `h="100%"` on the chart plus a label
  // above it would overflow the cell by the label's height.
  return (
    <Stack
      gap="sm"
      mih={stackCount ? stackCount * STACK_PANEL_HEIGHT : "10rem"}
    >
      {label && <Text size="lg">{label}</Text>}
      <Box flex={1} mih={0}>
        <Visualization
          rawSeries={series}
          timelineEvents={timelineEvents}
          className={S.chart}
        />
      </Box>
    </Stack>
  );
}

interface ExplorationHeatMapProps {
  series: SingleSeries[];
  label?: string;
}

function ExplorationHeatMap({ series, label }: ExplorationHeatMapProps) {
  const combinedSeries = getHeatMapSeries({ series });
  // The pivoted heat-map renders one body row per segment series plus a
  // header row. Size the table to exactly that height (rather than
  // `h="100%"`) so a short table isn't stretched to fill — and leave empty
  // space below — its grid cell.
  const tableHeight = HEADER_HEIGHT + series.length * ROW_HEIGHT;
  return (
    <Stack gap="sm">
      {label && <Text size="lg">{label}</Text>}
      <Box h={tableHeight}>
        <Visualization rawSeries={[combinedSeries]} className={S.chart} />
      </Box>
    </Stack>
  );
}

interface ExplorationMapProps {
  series: SingleSeries[];
  queryColors: Record<string, string>;
  label?: string;
}

function ExplorationMap({ series, queryColors, label }: ExplorationMapProps) {
  // The Stack is the grid item — height auto so it stretches to the cell.
  // The label and (optional) legend take their natural height; the map
  // boxes inside use `flex={1}` to share whatever vertical space is left.
  return (
    <Stack gap="md">
      {label && <Text size="lg">{label}</Text>}
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
