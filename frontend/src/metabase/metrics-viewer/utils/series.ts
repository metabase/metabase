import type { DimensionOption } from "metabase/common/components/DimensionPill";
import type { DimensionItem } from "metabase/common/components/DimensionPillBar";
import { getColumnIcon } from "metabase/common/utils/columns";
import { getColorsForValues } from "metabase/lib/colors/charts";
import * as Lib from "metabase-lib";
import type {
  Dataset,
  SingleSeries,
  VisualizationSettings,
} from "metabase-types/api";

import {
  getDefinitionCard,
  getDefinitionMeasure,
  getDefinitionName,
  getDefinitionTableId,
  getQueryFromDefinition,
} from "../adapters/definition-loader";
import { STAGE_INDEX } from "../constants";
import type {
  DefinitionId,
  MetricsViewerDefinitionEntry,
  MetricsViewerTabState,
  SelectedMetric,
  TempJsMetricDefinition,
} from "../types/viewer-state";
import {
  isMeasureDefinition,
  isMetricDefinition,
} from "../types/viewer-state";

import { buildExecutableQuery } from "./queries";
import { measureToCardId, parseSourceId } from "./source-ids";
import { DISPLAY_TYPE_REGISTRY } from "./tab-config";

function getDefinitionNumericId(definition: TempJsMetricDefinition): number {
  if (isMetricDefinition(definition)) {
    return definition["source-metric"];
  }
  if (isMeasureDefinition(definition)) {
    return definition["source-measure"];
  }
  throw new Error("Definition is neither metric nor measure");
}

function getAggregationColumnName(
  definition: TempJsMetricDefinition,
): string | null {
  const query = getQueryFromDefinition(definition);
  if (!query) {
    return null;
  }

  const breakouts = Lib.breakouts(query, STAGE_INDEX);
  const breakoutNames = new Set(
    breakouts
      .map((b) => {
        const col = Lib.breakoutColumn(query, STAGE_INDEX, b);
        return col ? Lib.displayInfo(query, STAGE_INDEX, col).name : null;
      })
      .filter(Boolean),
  );

  const columns = Lib.returnedColumns(query, STAGE_INDEX);
  for (const col of columns) {
    const info = Lib.displayInfo(query, STAGE_INDEX, col);
    if (!breakoutNames.has(info.name)) {
      return info.name;
    }
  }

  return null;
}

export function computeSourceColors(
  definitions: MetricsViewerDefinitionEntry[],
): Record<number, string> {
  if (definitions.length === 0) {
    return {};
  }

  const keys: string[] = [];
  const numericIds: number[] = [];

  for (let i = 0; i < definitions.length; i++) {
    const entry = definitions[i];
    const name = getDefinitionName(entry.definition);

    numericIds.push(getDefinitionNumericId(entry.definition));

    if (!name) {
      keys.push(entry.id);
    } else if (i === 0) {
      keys.push(getAggregationColumnName(entry.definition) ?? name);
    } else {
      keys.push(name);
    }
  }

  if (keys.length === 0) {
    return {};
  }

  const colorMapping = getColorsForValues(keys);

  const idToColor: Record<number, string> = {};
  for (let i = 0; i < numericIds.length; i++) {
    idToColor[numericIds[i]] = colorMapping[keys[i]];
  }

  return idToColor;
}

export function buildRawSeriesFromDefinitions(
  definitions: MetricsViewerDefinitionEntry[],
  tab: MetricsViewerTabState,
  resultsByDefinitionId: Map<DefinitionId, Dataset>,
  modifiedQueries: Map<DefinitionId, Lib.Query | null>,
): SingleSeries[] {
  const validSeries: SingleSeries[] = [];
  let vizSettings: VisualizationSettings | null = null;

  for (const tabDef of tab.definitions) {
    const entry = definitions.find((d) => d.id === tabDef.definitionId);
    if (!entry) {
      continue;
    }

    const query = modifiedQueries.get(entry.id);
    const result = resultsByDefinitionId.get(entry.id);

    if (!query || !result?.data?.cols?.length) {
      continue;
    }

    const breakouts = Lib.breakouts(query, STAGE_INDEX);
    if (breakouts.length === 0) {
      continue;
    }

    if (vizSettings === null) {
      vizSettings = DISPLAY_TYPE_REGISTRY[tab.display].getSettings(query);
    }

    const { definition } = entry;
    const card = getDefinitionCard(definition);
    const measure = getDefinitionMeasure(definition);

    if (isMetricDefinition(definition) && card) {
      validSeries.push({
        card: {
          ...card,
          display: tab.display,
          visualization_settings: {
            ...card.visualization_settings,
            ...vizSettings,
          },
        },
        data: result.data,
      });
    } else if (isMeasureDefinition(definition) && measure) {
      const syntheticCard = {
        id: measureToCardId(definition["source-measure"]),
        name: measure.name,
        display: tab.display,
        visualization_settings: vizSettings,
      };
      validSeries.push({
        card: syntheticCard as SingleSeries["card"],
        data: result.data,
      });
    }
  }

  return validSeries;
}

function computeAvailableOptions(
  query: Lib.Query,
  columnFilter?: (col: Lib.ColumnMetadata) => boolean,
): DimensionOption[] {
  const columns = Lib.breakoutableColumns(query, STAGE_INDEX);
  const filtered = columns.filter((col) => {
    const info = Lib.displayInfo(query, STAGE_INDEX, col);
    if (info.isImplicitlyJoinable) {
      return false;
    }
    return columnFilter ? columnFilter(col) : true;
  });

  return filtered.map((col) => {
    const info = Lib.displayInfo(query, STAGE_INDEX, col);
    return {
      name: info.name,
      displayName: info.displayName,
      icon: getColumnIcon(col),
    };
  });
}

export function buildDimensionItemsFromDefinitions(
  definitions: MetricsViewerDefinitionEntry[],
  tab: MetricsViewerTabState,
  modifiedQueries: Map<DefinitionId, Lib.Query | null>,
  sourceColors: Record<number, string>,
  columnFilter?: (col: Lib.ColumnMetadata) => boolean,
): DimensionItem[] {
  const items: DimensionItem[] = [];

  for (const tabDef of tab.definitions) {
    const entry = definitions.find((d) => d.id === tabDef.definitionId);
    if (!entry) {
      continue;
    }

    const query = modifiedQueries.get(entry.id);
    const { id: numericId } = parseSourceId(entry.id);
    const baseQuery = getQueryFromDefinition(entry.definition);

    if (!query) {
      if (!tabDef.projectionDimensionId && baseQuery) {
        items.push({
          id: entry.id,
          label: undefined,
          icon: undefined,
          color: sourceColors[numericId],
          availableOptions: computeAvailableOptions(baseQuery, columnFilter),
        });
      }
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

    const columnInfo = Lib.displayInfo(
      query,
      STAGE_INDEX,
      Lib.withTemporalBucket(column, null),
    );

    const optionsQuery = baseQuery ?? query;

    items.push({
      id: entry.id,
      label: columnInfo.displayName,
      icon: getColumnIcon(column),
      color: sourceColors[numericId],
      availableOptions: computeAvailableOptions(optionsQuery, columnFilter),
    });
  }

  return items;
}

export function getSelectedMetricsInfo(
  definitions: MetricsViewerDefinitionEntry[],
  loadingIds: Set<DefinitionId>,
): SelectedMetric[] {
  return definitions.flatMap((entry): SelectedMetric[] => {
    const { definition } = entry;
    const isLoading = loadingIds.has(entry.id);
    const name = getDefinitionName(definition);

    if (isMetricDefinition(definition)) {
      return [{
        id: definition["source-metric"],
        sourceType: "metric",
        name,
        isLoading,
      }];
    }

    if (isMeasureDefinition(definition)) {
      const tableId = getDefinitionTableId(definition);
      return [{
        id: definition["source-measure"],
        sourceType: "measure",
        name,
        isLoading,
        tableId: tableId ?? undefined,
      }];
    }

    return [];
  });
}

export function computeModifiedQueries(
  definitions: MetricsViewerDefinitionEntry[],
  tab: MetricsViewerTabState,
): Map<DefinitionId, Lib.Query | null> {
  const queries = new Map<DefinitionId, Lib.Query | null>();

  for (const tabDef of tab.definitions) {
    const entry = definitions.find((d) => d.id === tabDef.definitionId);
    if (!entry) {
      queries.set(tabDef.definitionId, null);
      continue;
    }

    const baseQuery = getQueryFromDefinition(entry.definition);
    if (!baseQuery) {
      queries.set(tabDef.definitionId, null);
      continue;
    }

    const execQuery = buildExecutableQuery(
      baseQuery,
      tab,
      tabDef.projectionDimensionId,
    );
    queries.set(entry.id, execQuery);
  }

  return queries;
}
