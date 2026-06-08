import { useMemo } from "react";

import { MetricCardVisualization } from "metabase/data-studio/common/components/OverviewVisualization";
import { useCardQueryData } from "metabase/data-studio/common/hooks/use-card-query-data";
import { useMetricDefinition } from "metabase/metrics/common/hooks";
import { isNumericMetric } from "metabase/metrics/utils/validation";
import { Box, Flex, Stack } from "metabase/ui";
import * as LibMetric from "metabase-lib/metric";
import type { Card } from "metabase-types/api";

import type { MetricUrls } from "../../../types";

import { AboutVisualization } from "./AboutVisualization";
import { DescriptionSection } from "./DescriptionSection";
import { ExploreMetricButton } from "./ExploreMetricButton";
import S from "./MetricAbout.module.css";

interface MetricAboutProps {
  card: Card;
  urls: MetricUrls;
}

export function MetricAbout({ card, urls }: MetricAboutProps) {
  const { definition } = useMetricDefinition(card.id ?? null);
  const { data, isLoading } = useCardQueryData(card);

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
    <Flex className={S.root} flex={1} gap="md">
      <Box className={S.chartContainer} flex={1} mah={700}>
        {isNumericMetric(card) && (
          <Box className={S.exploreButtonOverlay}>
            <ExploreMetricButton cardId={card.id} />
          </Box>
        )}
        {hasTimeDimension ? (
          <AboutVisualization card={card} />
        ) : (
          <MetricCardVisualization
            card={card}
            data={data}
            isLoading={isLoading}
            className={S.visualizationPanel}
          />
        )}
      </Box>
      <Stack flex="0 0 360px" className={S.descriptionSection} mah={700}>
        <DescriptionSection card={card} urls={urls} />
      </Stack>
    </Flex>
  );
}
