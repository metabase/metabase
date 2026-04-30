import { useMemo } from "react";

import { useGetExplorationQueryResultQuery } from "metabase/api/exploration";
import { createSeriesCard } from "metabase/metrics/utils/series";
import { Stack, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
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

  const series = useMemo(() => {
    if (!dataset) {
      return undefined;
    }
    return [
      {
        card: createSeriesCard(
          explorationQuery.id,
          explorationQuery.name,
          "line",
          {
            "graph.dimensions": getDimensions(dataset),
            ...(explorationQuery.visualization_settings ?? {}),
          },
        ),
        data: dataset.data,
      },
    ];
  }, [dataset, explorationQuery]);

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
  // the first column is the date column and should be the x-axis
  // the second column is the breakout
  // we have to provide these manually, otherwise viz settings might swap them based on cardinality
  return [cols[0]?.name, cols[1]?.name];
}
