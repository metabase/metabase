import { useCallback, useEffect, useMemo, useState } from "react";

import { metricApi } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { Paper, Stack, Text } from "metabase/ui";
import type { DimensionMetadata } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { Dataset } from "metabase-types/api";

import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerTabState,
} from "../../types/viewer-state";
import {
  buildDimensionItemsFromDefinitions,
  buildRawSeriesFromDefinitions,
  computeModifiedDefinitions,
  computeSourceColors,
} from "../../utils/series";
import { getTabConfig } from "../../utils/tab-config";
import { MetricsViewerVisualization } from "../MetricsViewerVisualization";

import S from "./MetricsViewerCard.module.css";

type MetricsViewerCardProps = {
  definitions: MetricsViewerDefinitionEntry[];
  tab: MetricsViewerTabState;
  onDimensionChange: (
    definitionId: MetricSourceId,
    dimension: DimensionMetadata,
  ) => void;
};

export function MetricsViewerCard({
  definitions,
  tab,
  onDimensionChange,
}: MetricsViewerCardProps) {
  const dispatch = useDispatch();
  const tabConfig = getTabConfig(tab.type);

  const modifiedDefinitions = useMemo(
    () => computeModifiedDefinitions(definitions, tab),
    [definitions, tab],
  );

  const [results, setResults] = useState<Map<MetricSourceId, Dataset>>(
    new Map(),
  );

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      const newResults = new Map<MetricSourceId, Dataset>();

      const promises = tab.definitions.map(async (tabDef) => {
        const modDef = modifiedDefinitions.get(tabDef.definitionId);
        if (!modDef) {
          return;
        }
        const jsDefinition = LibMetric.toJsMetricDefinition(modDef);
        const result = await dispatch(
          metricApi.endpoints.getMetricDataset.initiate({
            definition: jsDefinition,
          }),
        );
        if (!cancelled && result.data) {
          newResults.set(tabDef.definitionId, result.data);
        }
      });

      await Promise.allSettled(promises);

      if (!cancelled) {
        setResults(newResults);
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [dispatch, tab.definitions, modifiedDefinitions]);

  const rawSeries = useMemo(
    () =>
      buildRawSeriesFromDefinitions(
        definitions,
        tab,
        results,
        modifiedDefinitions,
      ),
    [definitions, tab, results, modifiedDefinitions],
  );

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
      <Stack>
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
        />
      </Stack>
    </Paper>
  );
}
