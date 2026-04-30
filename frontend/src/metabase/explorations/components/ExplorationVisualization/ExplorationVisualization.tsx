import { useMemo } from "react";

import { useGetAdhocQueryMetadataQuery } from "metabase/api/dataset";
import { useGetExplorationQueryResultQuery } from "metabase/api/exploration";
import { createSeriesCard } from "metabase/metrics/utils/series";
import { useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Stack, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import * as Lib from "metabase-lib";
import type { Dataset, ExplorationQuery } from "metabase-types/api";

import S from "./ExplorationVisualization.module.css";

interface ExplorationVisualizationProps {
  explorationQuery: ExplorationQuery;
}

export function ExplorationVisualization({
  explorationQuery,
}: ExplorationVisualizationProps) {
  const { data: dataset } = useGetExplorationQueryResultQuery(
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
            ...(explorationQuery.visualization_settings ?? {}),
          },
        ),
        data: dataset.data,
      },
    ];
  }, [explorationQuery, dataset, isMetadataLoading, metadata]);

  return (
    <Stack
      flex={1}
      h="100%"
      bg="background-primary"
      bd="1px solid border"
      bdrs="md"
      p="lg"
    >
      <Text fw="bold" size="lg">
        {explorationQuery.name}
      </Text>
      <Visualization rawSeries={series} className={S.chart} />
    </Stack>
  );
}

function getDimensions(dataset: Dataset) {
  const cols = dataset.data.cols;
  if (cols.length === 3) {
    // the first column is the date column and should be the x-axis
    // the second column is the breakout
    // we have to provide these manually, otherwise viz settings might swap them based on cardinality
    return [cols[0]?.name, cols[1]?.name];
  }
  return undefined;
}
