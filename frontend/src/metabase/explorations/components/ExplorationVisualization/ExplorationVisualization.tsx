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
  ExplorationThread,
  Timeline,
  TimelineEvent,
  TimelineId,
} from "metabase-types/api";
import { isCardDisplayType } from "metabase-types/api";

import { ExplorationChartSkeleton } from "./ExplorationChartSkeleton";
import S from "./ExplorationVisualization.module.css";
import { ExplorationVisualizationHeader } from "./ExplorationVisualizationHeader";
import { getDimensions } from "./utils";

interface ExplorationVisualizationProps {
  explorationQueries: ExplorationQuery[];
  explorationThread?: ExplorationThread;
  availableTimelines: Timeline[];
  selectedTimelineId: TimelineId | null;
  onSelectTimelineId: (timelineId: TimelineId | null) => void;
  timelineEvents: TimelineEvent[];
  interestingTimelineIds?: ReadonlySet<TimelineId>;
}

type ExplorationVisualizationBodyProps = Omit<
  ExplorationVisualizationProps,
  "explorationQueries"
> & {
  explorationQuery: ExplorationQuery;
};

export function ExplorationVisualization(props: ExplorationVisualizationProps) {
  return (
    <Stack
      flex={1}
      h="100%"
      py="3rem"
      pr="3rem"
      align="center"
      style={{ overflowY: "auto" }}
    >
      <Stack
        flex={1}
        w="100%"
        maw="70rem"
        bg="background-primary"
        bd="1px solid border"
        bdrs="md"
        p="lg"
      >
        {props.explorationQueries.map((query) => (
          <ExplorationVisualizationBody
            key={query.id}
            explorationQuery={query}
            {...props}
          />
        ))}
      </Stack>
    </Stack>
  );
}

function ExplorationVisualizationBody(
  props: ExplorationVisualizationBodyProps,
) {
  const { explorationQuery } = props;
  if (explorationQuery.status === "error") {
    return <ExplorationVisualizationError {...props} />;
  }

  if (explorationQuery.status !== "done") {
    return (
      <ExplorationChartSkeleton
        name={explorationQuery.name}
        explorationQuery={explorationQuery}
      />
    );
  }

  return <ExplorationVisualizationChart {...props} />;
}

function ExplorationVisualizationChart({
  explorationQuery,
  explorationThread,
  availableTimelines,
  selectedTimelineId,
  onSelectTimelineId,
  timelineEvents,
  interestingTimelineIds,
}: ExplorationVisualizationBodyProps) {
  const { currentData: dataset } = useGetExplorationQueryResultQuery(
    explorationQuery.id,
  );
  const { isLoading: isMetadataLoading } = useGetAdhocQueryMetadataQuery(
    explorationQuery.dataset_query,
  );
  const metadata = useSelector(getMetadata);

  const series = useMemo(() => {
    if (!dataset || isMetadataLoading) {
      return undefined;
    }
    const query = Lib.fromJsQueryAndMetadata(
      metadata,
      explorationQuery.dataset_query,
    );
    const { display, settings } = Lib.defaultDisplay(query);
    return [
      {
        card: createSeriesCard(
          explorationQuery.id,
          explorationQuery.name,
          display === "table" ? "bar" : display,
          {
            ...settings,
            "graph.dimensions": getDimensions(dataset),
          },
        ),
        data: dataset.data,
      },
    ];
  }, [explorationQuery, dataset, isMetadataLoading, metadata]);

  const display = useMemo(() => series?.[0]?.card?.display, [series]);

  const showTimelineDropdown = useMemo(() => {
    const col = series?.[0]?.data?.cols[0];
    return display === "line" && col && isDate(col);
  }, [series, display]);

  if (!series) {
    return (
      <ExplorationChartSkeleton
        name={explorationQuery.name}
        explorationQuery={explorationQuery}
      />
    );
  }

  return (
    <Stack flex={1} mih="15rem">
      <ExplorationVisualizationHeader
        name={explorationQuery.name}
        explorationQuery={explorationQuery}
        explorationThread={explorationThread}
        availableTimelines={availableTimelines}
        selectedTimelineId={selectedTimelineId}
        onSelectTimelineId={onSelectTimelineId}
        showTimelineDropdown={showTimelineDropdown}
        showDocumentMenu
        display={isCardDisplayType(display) ? display : undefined}
        interestingTimelineIds={interestingTimelineIds}
      />
      <Visualization
        rawSeries={series}
        timelineEvents={timelineEvents}
        className={S.chart}
      />
    </Stack>
  );
}

function ExplorationVisualizationError({
  explorationQuery,
}: ExplorationVisualizationBodyProps) {
  return (
    <>
      <ExplorationVisualizationHeader
        name={explorationQuery.name}
        explorationQuery={explorationQuery}
      />
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
        <Text fw="bold">{t`We couldn't generate this chart.`}</Text>
        {explorationQuery.error_message && (
          <Text c="text-secondary" maw="32rem">
            {explorationQuery.error_message}
          </Text>
        )}
      </Stack>
    </>
  );
}
