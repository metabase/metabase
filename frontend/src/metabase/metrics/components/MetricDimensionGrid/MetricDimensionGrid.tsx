import { MetricsViewerCardsGrid } from "metabase/metrics-viewer/components/MetricsViewerCardsGrid";
import { AddDimensionPopover } from "metabase/metrics-viewer/components/MetricsViewerTabs/AddDimensionPopover";
import { Flex, Loader } from "metabase/ui";
import type { MetricId } from "metabase-types/api/metric";

import { useMetricDimensionCards } from "./use-metric-dimension-cards";

type MetricDimensionGridProps = {
  metricId: MetricId;
};

export function MetricDimensionGrid({ metricId }: MetricDimensionGridProps) {
  const {
    cards,
    definitions,
    sourceColors,
    availableDimensions,
    sourceOrder,
    sourceDataById,
    isLoading,
    updateCard,
    addCard,
  } = useMetricDimensionCards(metricId);

  if (isLoading) {
    return (
      <Flex align="center" justify="center" flex={1}>
        <Loader />
      </Flex>
    );
  }

  if (cards.length === 0) {
    return null;
  }

  return (
    <Flex direction="column" gap="lg" flex={1}>
      <MetricsViewerCardsGrid
        definitions={definitions}
        tabs={cards}
        updateTab={updateCard}
        sourceColors={sourceColors}
        showDimensionPills={false}
        isInteractive={false}
      />
      <AddDimensionPopover
        availableDimensions={availableDimensions}
        sourceOrder={sourceOrder}
        sourceDataById={sourceDataById}
        hasMultipleSources={false}
        onAddTab={addCard}
      />
    </Flex>
  );
}
