import { MetricCardVisualization } from "metabase/common/data-studio/components/OverviewVisualization";
import { useCardQueryData } from "metabase/common/data-studio/hooks/use-card-query-data";
import type { MetricUrls } from "metabase/common/metrics/types";
import { isNumericMetric } from "metabase/metrics/utils/validation";
import { Box, Flex, Stack } from "metabase/ui";
import { isDate, isNumeric } from "metabase-lib/v1/types/utils/isa";
import type { Card } from "metabase-types/api";

import { AboutVisualization } from "./AboutVisualization";
import { DescriptionSection } from "./DescriptionSection";
import { ExploreMetricButton } from "./ExploreMetricButton";
import S from "./MetricAbout.module.css";

interface MetricAboutProps {
  card: Card;
  urls: MetricUrls;
}

export function MetricAbout({ card, urls }: MetricAboutProps) {
  const { data, isLoading } = useCardQueryData(card);

  // Time series → show value + change over time. Keyed off result columns, not the
  // Lib metric definition, so metrics defined on models (name-based breakout refs) work too.
  const cols = card.result_metadata;
  const isTimeSeries = isDate(cols?.[0]) && isNumeric(cols?.[1]);

  return (
    <Flex className={S.root} flex={1} gap="md">
      <Box className={S.chartContainer} flex={1} mah={700}>
        {isNumericMetric(card) && (
          <Box className={S.exploreButtonOverlay}>
            <ExploreMetricButton cardId={card.id} />
          </Box>
        )}
        {isTimeSeries ? (
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
