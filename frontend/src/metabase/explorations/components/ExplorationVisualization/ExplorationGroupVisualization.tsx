import { useElementSize } from "@mantine/hooks";
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
import { StickyXAxisChart } from "./StickyXAxisChart";
import { useMainChartAxisSnapshot } from "./useMainChartAxisSnapshot";
import { buildSeriesGroups } from "./utils";

const MIN_PANEL_HEIGHT_PX = 200;
const STICKY_AXIS_HEIGHT_PX = 60;

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
      {seriesGroups.map(({ series }) =>
        isCartesianChart(series[0].card.display) ? (
          <CartesianPageBody
            key={series[0].card.id}
            series={series}
            timelineEvents={timelineEvents}
          />
        ) : (
          // Non-cartesian (e.g. `map`): render each query as its own
          // chart, stacked vertically. Each chart gets a small header
          // row (color dot + chart name) consolidated in a single
          // wrap-flex legend at the top.
          <Stack
            key={series[0].card.id}
            gap="md"
            flex={1}
            mih={0}
            style={{ overflowY: "auto" }}
          >
            {series.length > 1 && (
              <Group
                gap="0.75rem"
                wrap="nowrap"
                role="list"
                aria-label={t`Legend`}
              >
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
              <Box
                key={s.card.id}
                flex={1}
                mih="10rem"
                style={{ flexShrink: 0 }}
              >
                <Visualization rawSeries={[s]} className={S.chart} />
              </Box>
            ))}
          </Stack>
        ),
      )}
    </>
  );
}

interface CartesianPageBodyProps {
  series: SingleSeries[];
  timelineEvents: TimelineEvent[];
}

function CartesianPageBody({ series, timelineEvents }: CartesianPageBodyProps) {
  // Extract the live x-axis option from the main chart's ECharts
  // instance so the sticky axis below it uses the exact same font,
  // tick formatter, axis name, and grid.left.
  const { mainChartContainerRef, mainChartAxisSnapshot } =
    useMainChartAxisSnapshot(true, series);

  const { ref: scrollContainerRef, height: scrollContainerHeight } =
    useElementSize();

  const naturalChartHeight = series.length * MIN_PANEL_HEIGHT_PX;
  const shouldShowStickyAxis =
    scrollContainerHeight > 0 &&
    naturalChartHeight > scrollContainerHeight - STICKY_AXIS_HEIGHT_PX;

  // When the sticky axis is active, hide the main chart's bottom
  // x-axis entirely (ticks + line + title) so we don't render the
  // axis twice. We pass `axis_enabled: false` (hides ticks/labels/
  // line) and `labels_enabled: false` (hides the axis title). The
  // sticky chart restores axis-label/line visibility on its own
  // copy of the option, and falls back to a separate `xAxisTitle`
  // prop for the title text (the main chart's snapshot loses
  // `xAxis.name` once `labels_enabled` is false).
  const adjustedSeries = useMemo(() => {
    if (!shouldShowStickyAxis) {
      return series;
    }
    return series.map((s) => ({
      ...s,
      card: {
        ...s.card,
        visualization_settings: {
          ...s.card.visualization_settings,
          "graph.x_axis.axis_enabled": false,
          "graph.x_axis.labels_enabled": false,
        },
      },
    }));
  }, [series, shouldShowStickyAxis]);

  // Compute the axis title independently of the rendered snapshot.
  // When `labels_enabled` is disabled on the main chart, its
  // snapshot loses `xAxis.name` — and reading from the snapshot
  // would race with the first ResizeObserver tick that triggers the
  // disable. The cartesian builder's default for
  // `graph.x_axis.title_text` is just the dimension column's
  // `display_name` (see `getDefaultXAxisTitle`), so compute it from
  // the series directly. Stable, no timing dependency.
  const xAxisTitle = series[0]?.data?.cols?.[0]?.display_name ?? null;

  return (
    <Box
      ref={scrollContainerRef}
      flex={1}
      mih={0}
      mah={MIN_PANEL_HEIGHT_PX * 2.5}
      style={{
        overflowY: "auto",
        position: "relative",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box ref={mainChartContainerRef} flex={1} mih={`${naturalChartHeight}px`}>
        <Visualization
          rawSeries={adjustedSeries}
          timelineEvents={timelineEvents}
          className={S.chart}
        />
      </Box>
      {shouldShowStickyAxis && (
        <Box
          h={`${STICKY_AXIS_HEIGHT_PX}px`}
          data-testid="exploration-sticky-x-axis"
          bg="background-primary"
          flex="none"
          style={{
            position: "sticky",
            bottom: 0,
            zIndex: 1,
            marginLeft: mainChartAxisSnapshot.chartLeftOffset || undefined, // When the main cartesian chart renders a side legend, mirror that horizontal box
            width:
              mainChartAxisSnapshot.chartWidth != null
                ? `${mainChartAxisSnapshot.chartWidth}px`
                : undefined,
          }}
        >
          <StickyXAxisChart
            series={series}
            xAxisOption={mainChartAxisSnapshot.xAxis}
            xAxisExtent={mainChartAxisSnapshot.xAxisExtent}
            xAxisCategories={mainChartAxisSnapshot.xAxisCategories}
            xAxisTitle={xAxisTitle}
            gridLeft={mainChartAxisSnapshot.gridLeft}
            gridRight={mainChartAxisSnapshot.gridRight}
          />
        </Box>
      )}
    </Box>
  );
}
