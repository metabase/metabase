import { useCallback, useEffect, useMemo, useState } from "react";

import { datasetApi } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { Paper, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Dataset } from "metabase-types/api";

import type {
  MetricsViewerDefinitionEntry,
  DefinitionId,
  MetricsViewerTabState,
} from "../../types/viewer-state";
import {
  buildRawSeriesFromDefinitions,
  buildDimensionItemsFromDefinitions,
  computeModifiedQueries,
} from "../../utils/series";
import { getTabConfig } from "../../utils/tab-config";
import { MetricsViewerVisualization } from "../MetricsViewerVisualization";

import S from "./MetricsViewerCard.module.css";

type MetricsViewerCardProps = {
  definitions: MetricsViewerDefinitionEntry[];
  tab: MetricsViewerTabState;
  sourceColors: Record<number, string>;
  onDimensionChange: (
    definitionId: DefinitionId,
    dimensionId: string,
  ) => void;
};

export function MetricsViewerCard({
  definitions,
  tab,
  sourceColors,
  onDimensionChange,
}: MetricsViewerCardProps) {
  const dispatch = useDispatch();
  const tabConfig = getTabConfig(tab.type);

  const modifiedQueries = useMemo(
    () => computeModifiedQueries(definitions, tab),
    [definitions, tab],
  );

  const [results, setResults] = useState<Map<DefinitionId, Dataset>>(new Map());

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      const newResults = new Map<DefinitionId, Dataset>();

      const promises = tab.definitions.map(async (tabDef) => {
        const query = modifiedQueries.get(tabDef.definitionId);
        if (!query) {
          return;
        }
        const datasetQuery = Lib.toLegacyQuery(query);
        const result = await dispatch(
          datasetApi.endpoints.getAdhocQuery.initiate(datasetQuery),
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
  }, [dispatch, tab.definitions, modifiedQueries]);

  const rawSeries = useMemo(
    () =>
      buildRawSeriesFromDefinitions(
        definitions,
        tab,
        results,
        modifiedQueries,
      ),
    [definitions, tab, results, modifiedQueries],
  );

  const dimensionItems = useMemo(
    () =>
      buildDimensionItemsFromDefinitions(
        definitions,
        tab,
        modifiedQueries,
        sourceColors,
        tabConfig.columnPredicate,
      ),
    [definitions, tab, modifiedQueries, sourceColors, tabConfig.columnPredicate],
  );

  const handleDimensionChange = useCallback(
    (itemId: string | number, optionName: string) => {
      onDimensionChange(String(itemId) as DefinitionId, optionName);
    },
    [onDimensionChange],
  );

  if (rawSeries.length === 0) {
    return null;
  }

  return (
    <Paper withBorder shadow="none" className={S.card}>
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
      />
    </Paper>
  );
}
