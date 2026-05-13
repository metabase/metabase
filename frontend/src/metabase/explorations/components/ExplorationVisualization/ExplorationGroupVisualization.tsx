import { useElementSize } from "@mantine/hooks";
import { useMemo } from "react";
import { t } from "ttag";

import { useGetAdhocQueryMetadataQuery } from "metabase/api/dataset";
import { useGetExplorationQueryResultQuery } from "metabase/api/exploration";
import { createSeriesCard } from "metabase/metrics/utils/series";
import { useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Group, Icon, Stack, Text } from "metabase/ui";
import { getColorsForValues } from "metabase/ui/colors/charts";
import { isCartesianChart } from "metabase/visualizations";
import { getColorplethColorScale } from "metabase/visualizations/components/ChoroplethMap";
import Visualization from "metabase/visualizations/components/Visualization";
import * as Lib from "metabase-lib";
import { isDate } from "metabase-lib/v1/types/utils/isa";
import type {
  ExplorationQuery,
  ExplorationQueryGroup,
  ExplorationThread,
  SingleSeries,
  Timeline,
  TimelineEvent,
  TimelineId,
  VisualizationSettings,
} from "metabase-types/api";
import {
  isCardDisplayType,
  isSettledExplorationQueryStatus,
} from "metabase-types/api";

import { ExplorationChartSkeleton } from "./ExplorationChartSkeleton";
import S from "./ExplorationVisualization.module.css";
import { ExplorationVisualizationHeader } from "./ExplorationVisualizationHeader";
import { StickyXAxisChart } from "./StickyXAxisChart";
import {
  type MainChartAxisSnapshot,
  useMainChartAxisSnapshot,
} from "./useMainChartAxisSnapshot";
import { getDimensions } from "./utils";

const MIN_PANEL_HEIGHT_PX = 300;
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
}

export function ExplorationGroupVisualization(
  props: ExplorationGroupVisualizationProps,
) {
  return (
    <Stack flex={1} h="100%" mih={0} py="3rem" pr="3rem" align="center">
      <Stack
        flex={1}
        mih={0}
        w="100%"
        maw="70rem"
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
      <>
        <ExplorationVisualizationHeader name={groupName} />
        <Stack gap="lg" h="100%">
          {queries.map((query) => (
            <ExplorationChartSkeleton
              key={query.id}
              name={query.name}
              explorationQuery={query}
            />
          ))}
        </Stack>
      </>
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
}: ExplorationGroupVisualizationProps) {
  // One RTKQ hook per query. ESLint complains about hooks-in-a-loop;
  // safe here because the parent keys this component on `group.id`, so
  // `queries` length is stable for the lifetime of a single mount.
  // RTKQ caches each per-query result for 30 minutes, so revisiting a
  // `page` group is instant.
  /* eslint-disable react-hooks/rules-of-hooks */
  const datasets = queries.map((q) => useGetExplorationQueryResultQuery(q.id));
  /* eslint-enable react-hooks/rules-of-hooks */

  // Adhoc-metadata for the first query drives default chart-type
  // selection. All queries in a `page` group share the same
  // `(card_id, dimension_id)` by BE construction, so picking any one
  // is correct.
  const { isLoading: isMetadataLoading } = useGetAdhocQueryMetadataQuery(
    queries[0].dataset_query,
  );
  const metadata = useSelector(getMetadata);

  const groupName = group.name ?? t`Group`;

  // Stable, length-tracked dependency for the series memo: the array of
  // dataset references. Spreading directly into `useMemo`'s deps is
  // disallowed (variable-length deps), so we collapse it to a single
  // value that changes whenever any dataset reference changes.
  const datasetRefs = datasets.map((d) => d.currentData);

  const queryColors = useMemo(
    () => getColorsForValues(queries.map((q) => String(q.id))),
    [queries],
  );

  const series = useMemo(() => {
    if (datasetRefs.some((d) => !d) || isMetadataLoading) {
      return undefined;
    }
    const baseLibQuery = Lib.fromJsQueryAndMetadata(
      metadata,
      queries[0].dataset_query,
    );
    const { display, settings } = Lib.defaultDisplay(baseLibQuery);
    const baseDisplay = display === "table" ? "bar" : display;
    const cartesian = isCartesianChart(baseDisplay);
    return queries.map((q, i) => {
      const dataset = datasetRefs[i]!;
      const cardSettings: VisualizationSettings = { ...settings };
      if (cartesian) {
        cardSettings["graph.dimensions"] = getDimensions(dataset);
        cardSettings["graph.split_panels"] = true; // Render every series in its own vertical pane along a shared x-axis
      } else if (baseDisplay === "map") {
        const color = queryColors[String(q.id)];
        if (color) {
          cardSettings["map.colors"] = getColorplethColorScale(color);
        }
      }
      return {
        card: createSeriesCard(q.id, q.name, baseDisplay, cardSettings),
        data: dataset.data,
      };
    });
    // datasetRefs is reconstructed every render but its identity-stable
    // entries make this safe; including the array directly would cause
    // an unstable dep warning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queries, isMetadataLoading, metadata, queryColors, ...datasetRefs]);

  const display = useMemo(() => series?.[0]?.card?.display, [series]);

  const isCartesian = useMemo(
    () => (display ? isCartesianChart(display) : false),
    [display],
  );

  const showTimelineDropdown = useMemo(() => {
    const firstSeries = series?.[0];
    const col = firstSeries?.data?.cols[0];
    return firstSeries?.card?.display === "line" && col && isDate(col);
  }, [series]);

  // Extract the live x-axis option from the main chart's ECharts
  // instance so the sticky axis below it uses the exact same font,
  // tick formatter, axis name, and grid.left.
  const { mainChartContainerRef, mainChartAxisSnapshot } =
    useMainChartAxisSnapshot(isCartesian, series);

  if (!series) {
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
        display={isCardDisplayType(display) ? display : undefined}
        interestingTimelineIds={interestingTimelineIds}
      />
      {isCartesian ? (
        <CartesianPageBody
          series={series}
          queries={queries}
          timelineEvents={timelineEvents}
          mainChartContainerRef={mainChartContainerRef}
          mainChartAxisSnapshot={mainChartAxisSnapshot}
        />
      ) : (
        // Non-cartesian (e.g. `map`): render each query as its own
        // chart, stacked vertically. Each chart gets a small header
        // row (color dot + chart name) consolidated in a single
        // wrap-flex legend at the top.
        <Stack gap="md" flex={1} mih={0} style={{ overflowY: "auto" }}>
          <Group gap="lg" wrap="wrap" role="list" aria-label={t`Legend`}>
            {series.map((s) => {
              const color = queryColors[s.card.id];
              return (
                <Group
                  key={s.card.id}
                  gap="xs"
                  align="center"
                  wrap="nowrap"
                  role="listitem"
                >
                  <Box
                    aria-hidden
                    w="0.625rem"
                    h="0.625rem"
                    bdrs="50%"
                    style={{ background: color }}
                  />
                  <Text fw="bold" size="sm">
                    {s.card.name}
                  </Text>
                </Group>
              );
            })}
          </Group>
          {series.map((s) => (
            <Box key={s.card.id} flex={1} mih="10rem" style={{ flexShrink: 0 }}>
              <Visualization rawSeries={[s]} className={S.chart} />
            </Box>
          ))}
        </Stack>
      )}
    </>
  );
}

interface CartesianPageBodyProps {
  series: SingleSeries[];
  queries: ExplorationQuery[];
  timelineEvents: TimelineEvent[];
  mainChartContainerRef: React.RefObject<HTMLDivElement>;
  mainChartAxisSnapshot: MainChartAxisSnapshot;
}

function CartesianPageBody({
  series,
  queries,
  timelineEvents,
  mainChartContainerRef,
  mainChartAxisSnapshot,
}: CartesianPageBodyProps) {
  const { ref: scrollContainerRef, height: scrollContainerHeight } =
    useElementSize();

  const naturalChartHeight = queries.length * MIN_PANEL_HEIGHT_PX;
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
