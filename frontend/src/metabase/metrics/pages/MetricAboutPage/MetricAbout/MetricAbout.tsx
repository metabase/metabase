import { useState } from "react";

import { MetricCardVisualization } from "metabase/common/data-studio/components/OverviewVisualization";
import type { MetricUrls } from "metabase/common/metrics/types";
import { isNumericMetric } from "metabase/metrics/utils/validation";
import { Box, Flex, Stack } from "metabase/ui";
import type { Card } from "metabase-types/api";

import { AboutVisualization } from "./AboutVisualization";
import { DescriptionSection } from "./DescriptionSection";
import { DimensionSelect } from "./DimensionSelect";
import { ExploreMetricButton } from "./ExploreMetricButton";
import S from "./MetricAbout.module.css";
import { useMetricAboutQuery } from "./use-metric-about-query";

interface MetricAboutProps {
  card: Card;
  urls: MetricUrls;
}

export function MetricAbout({ card, urls }: MetricAboutProps) {
  const [selectedDimensionId, setSelectedDimensionId] = useState<string | null>(
    null,
  );
  const {
    activeDimensionId,
    activeDimensionSelectLabel,
    data,
    dimensionOptions,
    isLoading,
    isTimeSeries,
    visualizationCard,
  } = useMetricAboutQuery(card, selectedDimensionId);

  return (
    <Flex className={S.root} flex={1} gap="md">
      <Box className={S.chartContainer} flex={1} mah={700}>
        {isNumericMetric(card) && (
          <Box className={S.exploreButtonOverlay}>
            <ExploreMetricButton cardId={card.id} />
          </Box>
        )}
        {isTimeSeries ? (
          <AboutVisualization
            card={visualizationCard}
            data={data}
            isLoading={isLoading}
          />
        ) : (
          <MetricCardVisualization
            card={visualizationCard}
            data={data}
            isLoading={isLoading}
            className={S.visualizationPanel}
          />
        )}
        {activeDimensionId && activeDimensionSelectLabel && (
          <Box className={S.dimensionSelectContainer}>
            <DimensionSelect
              label={activeDimensionSelectLabel}
              options={dimensionOptions}
              value={activeDimensionId}
              onChange={setSelectedDimensionId}
            />
          </Box>
        )}
      </Box>
      <Stack flex="0 0 360px" className={S.descriptionSection} mah={700}>
        <DescriptionSection card={card} urls={urls} />
      </Stack>
    </Flex>
  );
}
