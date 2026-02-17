import { SimpleGrid } from "metabase/ui";
import type { DimensionMetadata } from "metabase-lib/metric";

import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerTabState,
  SourceColorMap,
} from "../../types/viewer-state";
import { MetricsViewerCard } from "../MetricsViewerCard";

type MetricsViewerCardsGridProps = {
  definitions: MetricsViewerDefinitionEntry[];
  tabs: MetricsViewerTabState[];
  onDimensionChange: (
    tabId: string,
    definitionId: MetricSourceId,
    dimension: DimensionMetadata,
  ) => void;
  sourceColors: SourceColorMap;
};

export function MetricsViewerCardsGrid({
  definitions,
  tabs,
  onDimensionChange,
  sourceColors,
}: MetricsViewerCardsGridProps) {
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
      {tabs.map((tab) => (
        <MetricsViewerCard
          key={tab.id}
          definitions={definitions}
          tab={tab}
          onDimensionChange={(defId, dimension) =>
            onDimensionChange(tab.id, defId, dimension)
          }
          sourceColors={sourceColors}
        />
      ))}
    </SimpleGrid>
  );
}
