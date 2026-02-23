import { useCallback, useMemo } from "react";

import { Paper, Stack, Text } from "metabase/ui";
import type { DimensionMetadata } from "metabase-lib/metric";

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
  getCardIdToDimensionId,
} from "../../utils/series";
import { getTabConfig } from "../../utils/tab-config";
import { MetricsViewerVisualization } from "../MetricsViewerVisualization";

import S from "./MetricsViewerCard.module.css";

type MetricsViewerCardProps = {
  definitions: MetricsViewerDefinitionEntry[];
  tab: MetricsViewerTabState;
  onTabUpdate: (updates: Partial<MetricsViewerTabState>) => void;
  onDimensionChange: (
    definitionId: MetricSourceId,
    dimension: DimensionMetadata,
  ) => void;
  sourceColors: SourceColorMap;
};

export function MetricsViewerCard({
  definitions,
  tab,
  onTabUpdate,
  onDimensionChange,
  sourceColors,
}: MetricsViewerCardProps) {
  const tabConfig = getTabConfig(tab.type);

  const { resultsByDefinitionId, modifiedDefinitions } = useDefinitionQueries(
    definitions,
    tab,
  );

  const rawSeries = useMemo(
    () =>
      buildRawSeriesFromDefinitions(
        definitions,
        tab,
        resultsByDefinitionId,
        modifiedDefinitions,
        sourceColors,
      ),
    [
      definitions,
      tab,
      resultsByDefinitionId,
      modifiedDefinitions,
      sourceColors,
    ],
  );
  const cardIdToDimensionId = useMemo(() => {
    return getCardIdToDimensionId(rawSeries);
  }, [rawSeries]);

  const cardColors = useMemo(
    () => computeSourceColors(definitions),
    [definitions],
  );

  const dimensionItems = useMemo(
    () =>
      buildDimensionItemsFromDefinitions(
        definitions,
        tab,
        modifiedDefinitions,
        cardColors,
        tabConfig.dimensionPredicate,
      ),
    [
      definitions,
      tab,
      modifiedDefinitions,
      cardColors,
      tabConfig.dimensionPredicate,
    ],
  );

  const handleDimensionChange = useCallback(
    (itemId: string | number, dimension: DimensionMetadata) => {
      onDimensionChange(itemId as MetricSourceId, dimension);
    },
    [onDimensionChange],
  );

  if (rawSeries.length === 0) {
    return null;
  }

  return (
    <Paper withBorder shadow="none" className={S.card}>
      <Stack h="100%">
        {tab.label && (
          <Text fw="bold" size="md" truncate="end" px="md" pt="sm">
            {tab.label}
          </Text>
        )}
        <MetricsViewerVisualization
          className={S.visualization}
          rawSeries={rawSeries}
          dimensionItems={dimensionItems}
          onDimensionChange={handleDimensionChange}
          layout={tab.layout}
          definitions={definitions}
          tab={tab}
          onTabUpdate={onTabUpdate}
          cardIdToDimensionId={cardIdToDimensionId}
        />
      </Stack>
    </Paper>
  );
}
