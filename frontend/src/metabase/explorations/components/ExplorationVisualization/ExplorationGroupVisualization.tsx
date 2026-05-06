import { useMemo } from "react";
import { t } from "ttag";

import { useGetAdhocQueryMetadataQuery } from "metabase/api/dataset";
import { useGetExplorationQueryResultQuery } from "metabase/api/exploration";
import { createSeriesCard } from "metabase/metrics/utils/series";
import { useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Icon, Stack, Text } from "metabase/ui";
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
} from "metabase-types/api";
import {
  isCardDisplayType,
  isSettledExplorationQueryStatus,
} from "metabase-types/api";

import { ExplorationChartSkeleton } from "./ExplorationChartSkeleton";
import S from "./ExplorationVisualization.module.css";
import { ExplorationVisualizationHeader } from "./ExplorationVisualizationHeader";
import { getDimensions } from "./utils";

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
    <Stack flex={1} h="100%" py="3rem" pr="3rem" align="center">
      <Stack
        flex={1}
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
    return queries.map((q, i) => {
      const dataset = datasetRefs[i]!;
      return {
        card: createSeriesCard(q.id, q.name, baseDisplay, {
          ...settings,
          "graph.dimensions": getDimensions(dataset),
          // Render every series in its own vertical pane along a shared
          // x-axis (one chart, N panels).
          "graph.split_panels": true,
        }),
        data: dataset.data,
      };
    });
    // datasetRefs is reconstructed every render but its identity-stable
    // entries make this safe; including the array directly would cause
    // an unstable dep warning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queries, isMetadataLoading, metadata, ...datasetRefs]);

  const display = useMemo(() => series?.[0]?.card?.display, [series]);

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
      <Visualization
        rawSeries={series}
        timelineEvents={timelineEvents}
        className={S.chart}
      />
    </>
  );
}
