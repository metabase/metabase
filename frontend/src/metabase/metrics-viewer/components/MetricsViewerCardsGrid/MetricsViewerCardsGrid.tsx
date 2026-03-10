import { SimpleGrid } from "metabase/ui";
import type { DimensionMetadata } from "metabase-lib/metric";
import type { VisualizationSettings } from "metabase-types/api";

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
  updateTab: (tabId: string, updates: Partial<MetricsViewerTabState>) => void;
  onDimensionChange?: (
    tabId: string,
    definitionId: MetricSourceId,
    dimension: DimensionMetadata,
  ) => void;
  onDimensionRemove?: (tabId: string, definitionId: MetricSourceId) => void;
  sourceColors: SourceColorMap;
  showDimensionPills?: boolean;
  isInteractive?: boolean;
  settingsOverrides?: VisualizationSettings;
};

export function MetricsViewerCardsGrid({
  definitions,
  tabs,
  updateTab,
  onDimensionChange,
  onDimensionRemove,
  sourceColors,
  showDimensionPills,
  isInteractive,
  settingsOverrides,
}: MetricsViewerCardsGridProps) {
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
      {tabs.map((tab) => (
        <MetricsViewerCard
          key={tab.id}
          definitions={definitions}
          tab={tab}
          onTabUpdate={(updates) => updateTab(tab.id, updates)}
          onDimensionChange={
            onDimensionChange
              ? (defId, dimension) =>
                  onDimensionChange(tab.id, defId, dimension)
              : undefined
          }
          onDimensionRemove={
            onDimensionRemove
              ? (defId) => onDimensionRemove(tab.id, defId)
              : undefined
          }
          sourceColors={sourceColors}
          showDimensionPills={showDimensionPills}
          isInteractive={isInteractive}
          settingsOverrides={settingsOverrides}
        />
      ))}
    </SimpleGrid>
  );
}
