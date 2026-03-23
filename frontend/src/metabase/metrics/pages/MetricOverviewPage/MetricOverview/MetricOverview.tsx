import { useMemo } from "react";

import {
  OverviewVisualization,
  useCardQueryData,
} from "metabase/data-studio/common/components/OverviewVisualization";
import { useMetricDefinition } from "metabase/metrics/common/hooks";
import { Box, Flex, Stack } from "metabase/ui";
import {
  TrendInfo,
  useTrendData,
} from "metabase/visualizations/components/TrendInfo";
import * as LibMetric from "metabase-lib/metric";
import type { Card } from "metabase-types/api";

import type { MetricUrls } from "../../../types";

import { DescriptionSection } from "./DescriptionSection";
import S from "./MetricOverview.module.css";

interface MetricOverviewProps {
  card: Card;
  urls: MetricUrls;
}

export function MetricOverview({ card, urls }: MetricOverviewProps) {
  const { definition } = useMetricDefinition(card.id ?? null);

  const hasTimeDimension = useMemo(
    () =>
      definition
        ? LibMetric.defaultBreakoutDimensions(definition).some(
            LibMetric.isDateOrDateTime,
          )
        : false,
    [definition],
  );

  return (
    <Flex className={S.root} flex={1}>
      <Flex direction="column" flex={1} mah={700}>
        {hasTimeDimension ? (
          <AboutVisualization card={card} />
        ) : (
          <OverviewVisualization card={card} />
        )}
      </Flex>
      <Stack flex="0 0 360px" className={S.descriptionSection} mah={700}>
        <DescriptionSection card={card} urls={urls} />
      </Stack>
    </Flex>
  );
}

function AboutVisualization({ card }: { card: Card }) {
  const { data, isLoading } = useCardQueryData(card);
  const trendData = useTrendData(data);

  const lineCard = useMemo(
    () => ({ ...card, display: "line" as const }),
    [card],
  );

  return (
    <Stack gap={0} h="100%" className={S.visualizationPanel}>
      {trendData && (
        <Box p="lg" pb={0}>
          <TrendInfo {...trendData} />
        </Box>
      )}
      <OverviewVisualization
        card={lineCard}
        data={data}
        isLoading={isLoading}
        className={S.innerVisualization}
      />
    </Stack>
  );
}
