import { useMemo } from "react";

import { MetricCardVisualization } from "metabase/common/data-studio/components/OverviewVisualization";
import { Box, Stack } from "metabase/ui";
import {
  TrendInfo,
  useTrendData,
} from "metabase/visualizations/components/TrendInfo";
import type { Card, Dataset } from "metabase-types/api";

import S from "./MetricAbout.module.css";

interface AboutVisualizationProps {
  card: Card;
  data: Dataset | undefined;
  isLoading: boolean;
}

const DATE_COLUMN_INDEX = 0;
const METRIC_COLUMN_INDEX = 1;

export function AboutVisualization({
  card,
  data,
  isLoading,
}: AboutVisualizationProps) {
  const trendData = useTrendData(data, DATE_COLUMN_INDEX, METRIC_COLUMN_INDEX);

  const lineCard = useMemo(
    () => ({ ...card, display: "line" as const }),
    [card],
  );

  return (
    <Stack gap={0} h="100%" className={S.visualizationPanel}>
      {trendData && (
        <Box p="xl" pb="sm" data-testid="metric-value-preview">
          <TrendInfo {...trendData} />
        </Box>
      )}
      <MetricCardVisualization
        card={lineCard}
        data={data}
        isLoading={isLoading}
        className={S.innerVisualization}
      />
    </Stack>
  );
}
