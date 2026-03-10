import { useMemo } from "react";

import { isNotNull } from "metabase/lib/types";
import { Paper, Stack, Text } from "metabase/ui";
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
  showDimensionPills?: boolean;
  isInteractive?: boolean;
  settingsOverrides?: VisualizationSettings;
};

export function MetricsViewerCard({
  definitions,
  tab,
  onTabUpdate,
  onDimensionChange,
  onDimensionRemove,
  sourceColors,
  showDimensionPills = true,
  isInteractive = true,
  settingsOverrides,
}: MetricsViewerCardProps) {
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

  if (rawSeries.length === 0) {
    return null;
  }

  return (
    <Paper
      withBorder
      shadow="none"
      className={S.card}
      data-testid="metrics-viewer-card"
    >
      <Stack h="100%">
        {tab.label && (
          <Text fw="bold" size="md" truncate="end" px="md" pt="sm">
            {tab.label}
          </Text>
        )}
        <MetricsViewerVisualization
          className={S.visualization}
          rawSeries={rawSeries}
          dimensionItems={showDimensionPills ? dimensionItems : []}
          onDimensionChange={
            showDimensionPills ? onDimensionChange : undefined
          }
          onDimensionRemove={
            showDimensionPills ? dimensionRemoveHandler : undefined
          }
          definitions={definitions}
          tab={tab}
          onTabUpdate={onTabUpdate}
          cardIdToDimensionId={cardIdToDimensionId}
          isInteractive={isInteractive}
        />
      </Stack>
    </Paper>
  );
}
