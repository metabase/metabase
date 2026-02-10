import type { DimensionOption } from "metabase/common/components/DimensionPill";
import type { DimensionItem } from "metabase/common/components/DimensionPillBar";
import { getColorsForValues } from "metabase/lib/colors/charts";
import {
  getColors,
  keyForSingleSeries,
} from "metabase/visualizations/lib/settings/series";
import { transformSeries } from "metabase/visualizations/visualizations/CartesianChart/chart-definition-legacy";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type {
  Dataset,
  SingleSeries,
  VisualizationSettings,
} from "metabase-types/api";

import { getDefinitionName } from "../adapters/definition-loader";
import type {
  DefinitionId,
  MetricsViewerDefinitionEntry,
  MetricsViewerTabState,
  SelectedMetric,
  SourceColorMap,
} from "../types/viewer-state";

import { buildExecutableDefinition } from "./queries";
import {
  cardIdToMeasureId,
  isMeasureCardId,
  measureToCardId,
  parseSourceId,
} from "./source-ids";
import { DISPLAY_TYPE_REGISTRY } from "./tab-config";
import { getDimensionIcon } from "./tabs";

export function computeSourceColors(
  definitions: MetricsViewerDefinitionEntry[],
): SourceColorMap {
  if (definitions.length === 0) {
    return {};
  }

  const keys: string[] = [];
  const numericIds: number[] = [];

  for (let i = 0; i < definitions.length; i++) {
    const entry = definitions[i];
    if (!entry.definition) {
      continue;
    }
    const name = getDefinitionName(entry.definition);

    const metricId = LibMetric.sourceMetricId(entry.definition);
    const measureId = LibMetric.sourceMeasureId(entry.definition);
    numericIds.push(metricId ?? measureId ?? 0);

    if (!name) {
      keys.push(entry.id);
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

export function computeColorsFromRawSeries(
  rawSeries: SingleSeries[],
): SourceColorMap {
  if (rawSeries.length === 0) {
    return {};
  }

  const transformed = transformSeries(rawSeries);
  const colorMapping = getColors(transformed, {});

  const result: SourceColorMap = {};
  for (const s of transformed) {
    const key = keyForSingleSeries(s);
    const color = colorMapping[key];
    const cardId = s.card.id;
    if (color && cardId != null) {
      const sourceId = isMeasureCardId(cardId)
        ? cardIdToMeasureId(cardId)
        : cardId;
      result[sourceId] = color;
    }
  }
  return result;
}

export function buildRawSeriesFromDefinitions(
  definitions: MetricsViewerDefinitionEntry[],
  tab: MetricsViewerTabState,
  resultsByDefinitionId: Map<DefinitionId, Dataset>,
  modifiedDefinitions: Map<DefinitionId, MetricDefinition | null>,
): SingleSeries[] {
  const validSeries: SingleSeries[] = [];
  let vizSettings: VisualizationSettings | null = null;

  for (const tabDef of tab.definitions) {
    const entry = definitions.find((d) => d.id === tabDef.definitionId);
    if (!entry || !entry.definition) {
      continue;
    }

    const modDef = modifiedDefinitions.get(entry.id);
    const result = resultsByDefinitionId.get(entry.id);

    if (!modDef || !result?.data?.cols?.length) {
      continue;
    }

    const projs = LibMetric.projections(modDef);
    if (projs.length === 0) {
      continue;
    }

    if (vizSettings === null) {
      vizSettings = DISPLAY_TYPE_REGISTRY[tab.display].getSettings(modDef);
    }

    const metricId = LibMetric.sourceMetricId(entry.definition);
    const measureId = LibMetric.sourceMeasureId(entry.definition);
    const name = getDefinitionName(entry.definition);

    if (metricId != null) {
      const syntheticCard = {
        id: metricId,
        name,
        display: tab.display,
        visualization_settings: vizSettings,
      };
      validSeries.push({
        card: syntheticCard as SingleSeries["card"],
        data: result.data,
      });
    } else if (measureId != null) {
      const syntheticCard = {
        id: measureToCardId(measureId),
        name,
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
  def: MetricDefinition,
  dimensionFilter?: (dim: LibMetric.DimensionMetadata) => boolean,
): DimensionOption[] {
  const dims = LibMetric.projectionableDimensions(def);
  const filtered = dims.filter((dim) => {
    const info = LibMetric.displayInfo(def, dim);
    if (info.isFromJoin) {
      return false;
    }
    return dimensionFilter ? dimensionFilter(dim) : true;
  });

  return filtered.map((dim) => {
    const info = LibMetric.displayInfo(def, dim);
    return {
      name: info.name!,
      displayName: info.displayName,
      icon: getDimensionIcon(dim),
    };
  });
}

export function buildDimensionItemsFromDefinitions(
  definitions: MetricsViewerDefinitionEntry[],
  tab: MetricsViewerTabState,
  modifiedDefinitions: Map<DefinitionId, MetricDefinition | null>,
  sourceColors: SourceColorMap,
  dimensionFilter?: (dim: LibMetric.DimensionMetadata) => boolean,
): DimensionItem[] {
  const items: DimensionItem[] = [];

  for (const tabDef of tab.definitions) {
    const entry = definitions.find((d) => d.id === tabDef.definitionId);
    if (!entry || !entry.definition) {
      continue;
    }

    const modDef = modifiedDefinitions.get(entry.id);
    const { id: numericId } = parseSourceId(entry.id);

    if (!modDef) {
      if (!tabDef.projectionDimensionId) {
        items.push({
          id: entry.id,
          label: undefined,
          icon: undefined,
          color: sourceColors[numericId],
          availableOptions: computeAvailableOptions(
            entry.definition,
            dimensionFilter,
          ),
        });
      }
      continue;
    }

    const projs = LibMetric.projections(modDef);
    if (projs.length === 0) {
      continue;
    }

    const dim = LibMetric.projectionDimension(modDef, projs[0]);
    if (!dim) {
      continue;
    }

    const dimInfo = LibMetric.displayInfo(modDef, dim);

    items.push({
      id: entry.id,
      label: dimInfo.displayName,
      icon: getDimensionIcon(dim),
      color: sourceColors[numericId],
      availableOptions: computeAvailableOptions(
        entry.definition,
        dimensionFilter,
      ),
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

    if (!definition) {
      const parsed = parseSourceId(entry.id);
      return [
        {
          id: parsed.id,
          sourceType: parsed.type,
          name: null,
          isLoading,
        },
      ];
    }

    const name = getDefinitionName(definition);
    const metricId = LibMetric.sourceMetricId(definition);
    if (metricId != null) {
      return [
        {
          id: metricId,
          sourceType: "metric",
          name,
          isLoading,
        },
      ];
    }

    const measureId = LibMetric.sourceMeasureId(definition);
    if (measureId != null) {
      return [
        {
          id: measureId,
          sourceType: "measure",
          name,
          isLoading,
        },
      ];
    }

    return [];
  });
}

export function computeModifiedDefinitions(
  definitions: MetricsViewerDefinitionEntry[],
  tab: MetricsViewerTabState,
): Map<DefinitionId, MetricDefinition | null> {
  const result = new Map<DefinitionId, MetricDefinition | null>();

  for (const tabDef of tab.definitions) {
    const entry = definitions.find((d) => d.id === tabDef.definitionId);
    if (!entry || !entry.definition) {
      result.set(tabDef.definitionId, null);
      continue;
    }

    const execDef = buildExecutableDefinition(
      entry.definition,
      tab,
      tabDef.projectionDimensionId,
    );
    result.set(entry.id, execDef);
  }

  return result;
}
