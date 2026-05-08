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
import { getDimensions } from "./utils";

// Per-chunk panel-cap constants (cartesian path). See the
// "Many-charts-on-one-page" plan for the derivation.
//
// We measure the chart card directly via `useElementSize` (its inner
// content rect already excludes the card's own padding). That gives a
// reliable, accurate height that adapts to the actual layout — no
// approximations for topbar, sidebar, page padding, etc.
const MIN_PANEL_HEIGHT_PX = 300;
const PANEL_GAP_PX = 30; // ECharts caps the gap at 48; 30 is the typical observed value
const PER_PANEL_BUDGET_PX = MIN_PANEL_HEIGHT_PX + PANEL_GAP_PX;
const CHUNK_CHROME_PX = 50; // outer padding + bottom x-axis labels inside one chunk
// Internal chrome between the measured card and the chunked Stack:
// the header (~32 px) plus the Stack's `gap="md"` between header and
// chunks (~16 px). The card's own `p="lg"` padding is already excluded
// because `useElementSize` reports `contentRect.height` (border-box
// minus padding/border).
const CARD_INTERNAL_CHROME_PX = 50;
const FALLBACK_MAX_PANELS = 4; // safety net before the first measurement lands

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
  // Measure the chart card. Its `contentRect` (border-box minus the
  // `p="lg"` padding) is the actual usable space available for the
  // header + chunked charts. Driving the per-chunk cap off this value
  // keeps the math accurate regardless of topbar / sidebar / page
  // padding sizes — those don't matter once we have the card height.
  const { ref: cardRef, height: cardHeight } = useElementSize();
  return (
    <Stack flex={1} h="100%" py="3rem" pr="3rem" align="center">
      <Stack
        ref={cardRef}
        flex={1}
        w="100%"
        maw="70rem"
        bg="background-primary"
        bd="1px solid border"
        bdrs="md"
        p="lg"
      >
        <ExplorationGroupVisualizationBody {...props} cardHeight={cardHeight} />
      </Stack>
    </Stack>
  );
}

type ExplorationGroupVisualizationBodyProps =
  ExplorationGroupVisualizationProps & {
    /**
     * Measured `contentRect.height` of the chart card (i.e. the
     * `<Stack p="lg">` wrapping this body). Drives the per-chunk
     * panel cap in the cartesian render path.
     */
    cardHeight: number;
  };

function ExplorationGroupVisualizationBody(
  props: ExplorationGroupVisualizationBodyProps,
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
  cardHeight,
}: ExplorationGroupVisualizationBodyProps) {
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

  // Cartesian-only: cap panels-per-chunk so each panel keeps a
  // readable height regardless of how many queries the group has.
  // The cap is derived from the chart card's measured content height
  // (passed in as `cardHeight`) — accurate by construction, no
  // approximations for topbar / sidebar / page padding.
  // See `frontend/src/metabase/visualizations/echarts/cartesian/layout/index.ts`
  // for the elastic panel-height formula we're sizing against.
  const maxPanelsPerChunk = useMemo(() => {
    if (cardHeight <= 0) {
      return FALLBACK_MAX_PANELS;
    }
    const usable = cardHeight - CARD_INTERNAL_CHROME_PX - CHUNK_CHROME_PX;
    // Floor at 2 so a tiny container never produces single-panel
    // chunks (a 1-panel chunk loses the multi-panel value-add).
    return Math.max(2, Math.floor(usable / PER_PANEL_BUDGET_PX));
  }, [cardHeight]);

  const seriesChunks = useMemo(() => {
    if (!series || series.length === 0) {
      return [];
    }
    const out: (typeof series)[] = [];
    for (let i = 0; i < series.length; i += maxPanelsPerChunk) {
      out.push(series.slice(i, i + maxPanelsPerChunk));
    }
    return out;
  }, [series, maxPanelsPerChunk]);

  const showTimelineDropdown = useMemo(() => {
    const firstSeries = series?.[0];
    const col = firstSeries?.data?.cols[0];
    return firstSeries?.card?.display === "line" && col && isDate(col);
  }, [series]);

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
        // Slice the queries into chunks so each panel keeps a readable
        // height. Each chunk is its own `<Visualization>` with
        // `graph.split_panels: true` (per-card setting set in the
        // series builder above), so each chunk has its own visible
        // x-axis directly under its panels — no "axis below the fold"
        // problem when the user scrolls between chunks.
        <Stack gap="md" flex={1} mih={0} style={{ overflowY: "auto" }}>
          {seriesChunks.map((chunk, i) => (
            <Box
              // The series array is already keyed by query id under
              // the hood; the chunk index is stable across renders for
              // a given (queries, maxPanelsPerChunk) pair.
              key={i}
              h={`${chunk.length * PER_PANEL_BUDGET_PX + CHUNK_CHROME_PX}px`}
              style={{ flexShrink: 0 }}
            >
              <Visualization
                rawSeries={chunk}
                // Timeline events are time-domain; chunks share the
                // dimension by construction (BE only emits `page`
                // groups for queries that share `(card_id, dimension_id)`),
                // so the same events render on every chunk at the same
                // x positions.
                timelineEvents={timelineEvents}
                className={S.chart}
              />
            </Box>
          ))}
        </Stack>
      ) : (
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
