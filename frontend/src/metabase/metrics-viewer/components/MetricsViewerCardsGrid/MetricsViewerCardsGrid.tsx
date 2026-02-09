import { SimpleGrid } from "metabase/ui";

import type { MetricsViewerDefinitionEntry, MetricsViewerTabState, DefinitionId } from "../../types/viewer-state";
import { MetricsViewerCard } from "../MetricsViewerCard";

type MetricsViewerCardsGridProps = {
  definitions: MetricsViewerDefinitionEntry[];
  tabs: MetricsViewerTabState[];
  sourceColors: Record<number, string>;
  onDimensionChange: (
    tabId: string,
    definitionId: DefinitionId,
    dimensionId: string,
  ) => void;
};

export function MetricsViewerCardsGrid({
  definitions,
  tabs,
  sourceColors,
  onDimensionChange,
}: MetricsViewerCardsGridProps) {
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
      {tabs.map((tab) => (
        <MetricsViewerCard
          key={tab.id}
          definitions={definitions}
          tab={tab}
          sourceColors={sourceColors}
          onDimensionChange={(defId, dimId) => onDimensionChange(tab.id, defId, dimId)}
        />
      ))}
    </SimpleGrid>
  );
}
