import { useCallback, useEffect, useMemo, useState } from "react";

import { datasetApi } from "metabase/api";
import type { DimensionItem } from "metabase/common/components/DimensionPillBar";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Box, Paper, SimpleGrid } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Dataset, SingleSeries } from "metabase-types/api";
import type {
  DimensionTab,
  MetricSourceId,
  MetricsExplorerDisplayType,
  SourceData,
} from "metabase-types/store/metrics-explorer";

import { updateTabColumns } from "../../metrics-explorer.slice";
import {
  selectBaseQueries,
  selectSourceColors,
  selectSourceDataById,
  selectSourceOrder,
} from "../../selectors";
import { buildModifiedQuery } from "../../utils/queries";
import {
  cardIdToSourceId,
  isMeasureSourceId,
  measureToCardId,
  parseSourceId,
} from "../../utils/source-ids";
import { DISPLAY_TYPE_REGISTRY, getTabConfig } from "../../utils/tab-registry";
import { ChartCard } from "../SeriesGrid/SeriesGrid";
import GridS from "../SeriesGrid/SeriesGrid.module.css";

const STAGE_INDEX = -1;

function buildRawSeries(
  sourceOrder: MetricSourceId[],
  sourceDataById: Record<MetricSourceId, SourceData>,
  modifiedQueries: Record<string, Lib.Query | null>,
  results: Record<string, Dataset>,
  displayType: MetricsExplorerDisplayType,
): SingleSeries[] {
  const validSeries: SingleSeries[] = [];
  let vizSettings: Record<string, unknown> | null = null;

  for (const sourceId of sourceOrder) {
    const sourceData = sourceDataById[sourceId];
    const query = modifiedQueries[sourceId];
    const result = results[sourceId];

    if (!sourceData || !query || !result?.data?.cols?.length) {
      continue;
    }

    const breakouts = Lib.breakouts(query, STAGE_INDEX);
    if (breakouts.length === 0) {
      continue;
    }

    if (vizSettings === null) {
      vizSettings = DISPLAY_TYPE_REGISTRY[displayType].getSettings({
        query,
        resultData: result.data,
      });
    }

    if (sourceData.type === "metric") {
      const { card } = sourceData.data;
      validSeries.push({
        card: {
          ...card,
          display: displayType,
          visualization_settings: {
            ...card.visualization_settings,
            ...vizSettings,
          },
        },
        data: result.data,
      });
    } else {
      const { id } = parseSourceId(sourceId);
      const syntheticCard = {
        id: measureToCardId(id),
        name: sourceData.data.measure.name,
        display: displayType,
        visualization_settings: vizSettings,
      } as unknown as SingleSeries["card"];
      validSeries.push({ card: syntheticCard, data: result.data });
    }
  }

  return validSeries;
}

function buildDimensionItems(
  sourceOrder: MetricSourceId[],
  modifiedQueries: Record<string, Lib.Query | null>,
  sourceColors: Record<number, string>,
): DimensionItem[] {
  const items: DimensionItem[] = [];

  for (const sourceId of sourceOrder) {
    const query = modifiedQueries[sourceId];
    if (!query) {
      continue;
    }

    const breakouts = Lib.breakouts(query, STAGE_INDEX);
    if (breakouts.length === 0) {
      continue;
    }

    const column = Lib.breakoutColumn(query, STAGE_INDEX, breakouts[0]);
    if (!column) {
      continue;
    }

    const { id } = parseSourceId(sourceId);
    const itemId = isMeasureSourceId(sourceId) ? measureToCardId(id) : id;

    items.push({
      id: itemId,
      query,
      stageIndex: STAGE_INDEX,
      column,
      color: sourceColors[id],
    });
  }

  return items;
}

interface AllTabsVisualizationProps {
  tabs: DimensionTab[];
}

export function AllTabsVisualization({ tabs }: AllTabsVisualizationProps) {
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
      {tabs.map((tab) => (
        <TabCharts key={tab.id} tab={tab} />
      ))}
    </SimpleGrid>
  );
}

interface TabChartsProps {
  tab: DimensionTab;
}

function TabCharts({ tab }: TabChartsProps) {
  const dispatch = useDispatch();
  const baseQueries = useSelector(selectBaseQueries);
  const sourceOrder = useSelector(selectSourceOrder);
  const sourceDataById = useSelector(selectSourceDataById);
  const sourceColors = useSelector(selectSourceColors);

  const tabType = tab.type;
  const tabConfig = getTabConfig(tabType);
  const displayType = tab.displayType ?? tabConfig.defaultDisplayType;
  const columnFilter = tabConfig.columnPredicate;

  const modifiedQueries = useMemo(() => {
    const projectionConfig =
      tab.projectionConfig ?? tabConfig.defaultProjectionConfig();
    const queries: Record<string, Lib.Query | null> = {};
    for (const sourceId of sourceOrder) {
      const baseQuery = baseQueries[sourceId];
      if (!baseQuery) {
        queries[sourceId] = null;
        continue;
      }
      const tabColumn = tab.columnsBySource.find(
        (c) => c.sourceId === sourceId,
      );
      queries[sourceId] = buildModifiedQuery(
        baseQuery,
        projectionConfig,
        tabType,
        tabColumn?.columnName,
      );
    }
    return queries;
  }, [baseQueries, sourceOrder, tab, tabType, tabConfig]);

  const [results, setResults] = useState<Record<string, Dataset>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    const fetchData = async () => {
      const newResults: Record<string, Dataset> = {};

      const promises = sourceOrder.map(async (sourceId) => {
        const query = modifiedQueries[sourceId];
        if (!query) {
          return;
        }
        const datasetQuery = Lib.toLegacyQuery(query);
        const result = await dispatch(
          datasetApi.endpoints.getAdhocQuery.initiate(datasetQuery),
        );
        if (!cancelled && result.data) {
          newResults[sourceId] = result.data as Dataset;
        }
      });

      await Promise.allSettled(promises);

      if (!cancelled) {
        setResults(newResults);
        setIsLoading(false);
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [dispatch, sourceOrder, modifiedQueries]);

  const rawSeries = useMemo(
    () =>
      buildRawSeries(
        sourceOrder,
        sourceDataById,
        modifiedQueries,
        results,
        displayType,
      ),
    [sourceOrder, sourceDataById, modifiedQueries, results, displayType],
  );

  const dimensionItems = useMemo(
    () => buildDimensionItems(sourceOrder, modifiedQueries, sourceColors),
    [sourceOrder, modifiedQueries, sourceColors],
  );

  const handleDimensionChange = useCallback(
    (cardId: string | number, newColumn: Lib.ColumnMetadata) => {
      if (typeof cardId !== "number") {
        return;
      }

      const sourceId = cardIdToSourceId(cardId);
      const query = modifiedQueries[sourceId];

      if (query) {
        const columnInfo = Lib.displayInfo(query, STAGE_INDEX, newColumn);
        dispatch(
          updateTabColumns({
            tabId: tab.id,
            sourceId,
            columnName: columnInfo.name,
          }),
        );
      }
    },
    [dispatch, tab.id, modifiedQueries],
  );

  const displayConfig = DISPLAY_TYPE_REGISTRY[displayType];

  if (isLoading) {
    return (
      <Paper withBorder shadow="none" className={GridS.card}>
        <Box className={GridS.chartArea}>
          <LoadingAndErrorWrapper loading />
        </Box>
      </Paper>
    );
  }

  if (rawSeries.length === 0) {
    return null;
  }

  if (displayConfig.supportsMultipleSeries) {
    return (
      <ChartCard
        rawSeries={rawSeries}
        dimensionItems={dimensionItems}
        columnFilter={columnFilter}
        onDimensionChange={handleDimensionChange}
        label={tab.label}
      />
    );
  }

  return (
    <>
      {rawSeries.map((series, index) => {
        const cardId = series.card.id;
        const cardDimensionItems = dimensionItems.filter(
          (item) => item.id === cardId,
        );
        return (
          <ChartCard
            key={cardId ?? index}
            rawSeries={[series]}
            dimensionItems={cardDimensionItems}
            columnFilter={columnFilter}
            onDimensionChange={handleDimensionChange}
            showTitle
            label={tab.label}
          />
        );
      })}
    </>
  );
}
