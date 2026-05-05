import { useMemo } from "react";

import { MetricCardVisualization } from "metabase/data-studio/common/components/OverviewVisualization";
import { useCardQueryData } from "metabase/data-studio/common/hooks/use-card-query-data";
import { Box, Stack } from "metabase/ui";
import {
  TrendInfo,
  useTrendData,
} from "metabase/visualizations/components/TrendInfo";
import type { Card } from "metabase-types/api";

import S from "./MetricAbout.module.css";

interface AboutVisualizationProps {
  card: Card;
}

const DATE_COLUMN_INDEX = 0;
const METRIC_COLUMN_INDEX = 1;

export function AboutVisualization({ card }: AboutVisualizationProps) {
  const { data, isLoading } = useCardQueryData(card);
  const trendData = useTrendData(data, DATE_COLUMN_INDEX, METRIC_COLUMN_INDEX);

  const lineCard = useMemo(
    () => ({ ...card, display: "line" as const }),
    [card],
  );

  return (
    <Stack gap={0} h="100%" className={S.visualizationPanel}>
      {trendData && (
        <Box p="xl" pb="sm">
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
