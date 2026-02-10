import { SimpleGrid } from "metabase/ui";

import type {
  DefinitionId,
  MetricsViewerDefinitionEntry,
  MetricsViewerTabState,
} from "../../types/viewer-state";
import { MetricsViewerCard } from "../MetricsViewerCard";

type MetricsViewerCardsGridProps = {
  definitions: MetricsViewerDefinitionEntry[];
  tabs: MetricsViewerTabState[];
  onDimensionChange: (
    tabId: string,
    definitionId: DefinitionId,
    dimensionId: string,
  ) => void;
};

export function MetricsViewerCardsGrid({
  definitions,
  tabs,
  onDimensionChange,
}: MetricsViewerCardsGridProps) {
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
      {tabs.map((tab) => (
        <MetricsViewerCard
          key={tab.id}
          definitions={definitions}
          tab={tab}
          onDimensionChange={(defId, dimId) =>
            onDimensionChange(tab.id, defId, dimId)
          }
        />
      ))}
    </SimpleGrid>
  );
}
