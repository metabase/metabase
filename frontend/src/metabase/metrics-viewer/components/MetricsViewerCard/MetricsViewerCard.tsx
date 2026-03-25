import { useMemo } from "react";

import { isNotNull } from "metabase/lib/types";
import { Paper, Skeleton, Stack, Text } from "metabase/ui";
import ChartSkeleton from "metabase/visualizations/components/skeletons/ChartSkeleton";
import type { DimensionMetadata } from "metabase-lib/metric";
import type { VisualizationSettings } from "metabase-types/api";

import { useDefinitionQueries } from "../../hooks/use-definition-queries";
import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerTabState,
  SourceColorMap,
} from "../../types/viewer-state";
import {
  buildDimensionItemsFromDefinitions,
  buildRawSeriesFromDefinitions,
  computeSourceColors,
} from "../../utils/series";
import { getTabConfig } from "../../utils/tab-config";
import { MetricsViewerVisualization } from "../MetricsViewerVisualization";

import S from "./MetricsViewerCard.module.css";

type MetricsViewerCardProps = {
  definitions: MetricsViewerDefinitionEntry[];
  tab: MetricsViewerTabState;
  onTabUpdate: (updates: Partial<MetricsViewerTabState>) => void;
  onDimensionChange?: (
    definitionId: MetricSourceId,
    dimension: DimensionMetadata,
  ) => void;
  onDimensionRemove?: (definitionId: MetricSourceId) => void;
  sourceColors: SourceColorMap;
  mode?: "interactive" | "readonly";
  settingsOverrides?: VisualizationSettings;
};

export function MetricsViewerCard({
  definitions,
  tab,
  onTabUpdate,
  onDimensionChange,
  onDimensionRemove,
  sourceColors,
  mode = "interactive",
  settingsOverrides,
}: MetricsViewerCardProps) {
  const isInteractive = mode === "interactive";
  const tabConfig = getTabConfig(tab.type);

  const { resultsByDefinitionId, modifiedDefinitions } = useDefinitionQueries(
    definitions,
    tab,
  );

  const { series: rawSeries, cardIdToDimensionId } = useMemo(
    () =>
      buildRawSeriesFromDefinitions(
        definitions,
        tab.dimensionMapping,
        tab.display,
        resultsByDefinitionId,
        modifiedDefinitions,
        sourceColors,
        settingsOverrides,
      ),
    [
      definitions,
      tab.dimensionMapping,
      tab.display,
      resultsByDefinitionId,
      modifiedDefinitions,
      sourceColors,
      settingsOverrides,
    ],
  );

  const cardColors = useMemo(
    () => computeSourceColors(definitions),
    [definitions],
  );

  const dimensionItems = useMemo(
    () =>
      buildDimensionItemsFromDefinitions(
        definitions,
        tab.dimensionMapping,
        modifiedDefinitions,
        cardColors,
        tabConfig.dimensionPredicate,
      ),
    [
      definitions,
      tab.dimensionMapping,
      modifiedDefinitions,
      cardColors,
      tabConfig.dimensionPredicate,
    ],
  );

  const mappedDimensionCount = Object.values(tab.dimensionMapping).filter(
    isNotNull,
  ).length;
  const dimensionRemoveHandler =
    mappedDimensionCount > 1 ? onDimensionRemove : undefined;

  return (
    <Paper
      withBorder
      shadow="none"
      className={S.card}
      data-testid="metrics-viewer-card"
    >
      <Stack h="100%">
        {tab.label != null ? (
          <Text fw="bold" size="md" truncate="end" px="md" pt="sm">
            {tab.label}
          </Text>
        ) : (
          <Skeleton h="1rem" w="40%" mx="md" mt="sm" />
        )}
        {rawSeries.length === 0 ? (
          <ChartSkeleton display={tab.display} className={S.visualization} />
        ) : (
          <MetricsViewerVisualization
            className={S.visualization}
            rawSeries={rawSeries}
            dimensionItems={isInteractive ? dimensionItems : []}
            onDimensionChange={isInteractive ? onDimensionChange : undefined}
            onDimensionRemove={
              isInteractive ? dimensionRemoveHandler : undefined
            }
            definitions={definitions}
            tab={tab}
            onTabUpdate={onTabUpdate}
            cardIdToDimensionId={cardIdToDimensionId}
            interactive={isInteractive}
          />
        )}
      </Stack>
    </Paper>
  );
}
