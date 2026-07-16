import { useState } from "react";
import { t } from "ttag";

import { MetricCardVisualization } from "metabase/common/data-studio/components/OverviewVisualization";
import type { MetricUrls } from "metabase/common/metrics/types";
import { isNumericMetric } from "metabase/metrics/utils/validation";
import { Box, Flex, Select, Stack } from "metabase/ui";
import type { Card } from "metabase-types/api";

import { AboutVisualization } from "./AboutVisualization";
import { DescriptionSection } from "./DescriptionSection";
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
        {activeDimensionId && dimensionOptions.length > 0 && (
          <Select
            aria-label={t`Dimension`}
            className={S.dimensionSelect}
            data={dimensionOptions}
            value={activeDimensionId}
            onChange={setSelectedDimensionId}
            allowDeselect={false}
            variant="unstyled"
          />
        )}
      </Box>
      <Stack flex="0 0 360px" className={S.descriptionSection} mah={700}>
        <DescriptionSection card={card} urls={urls} />
      </Stack>
    </Flex>
  );
}
