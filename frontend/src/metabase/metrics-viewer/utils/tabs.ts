import type { IconName } from "metabase/ui";
import * as LibMetric from "metabase-lib/metric";
import type { DimensionMetadata, MetricDefinition } from "metabase-lib/metric";
import type {
  MetricSourceId,
  MetricsViewerTabState,
  MetricsViewerTabType,
  StoredMetricsViewerTab,
} from "../types/viewer-state";

import { MAX_AUTO_TABS } from "../constants";

import { isDimensionCandidate } from "./queries";
import { TAB_TYPE_REGISTRY, getTabConfig } from "./tab-config";
import { getObjectEntries } from "metabase/lib/objects";

// ── Dimension icon helper ──

export function getDimensionIcon(dim: DimensionMetadata): IconName {
  if (LibMetric.isPrimaryKey(dim)) {
    return "label";
  }
  if (LibMetric.isForeignKey(dim)) {
    return "connections";
  }
  if (LibMetric.isBoolean(dim)) {
    return "io";
  }
  if (LibMetric.isDateOrDateTime(dim) || LibMetric.isTime(dim)) {
    return "calendar";
  }
  if (LibMetric.isCategory(dim)) {
    return "string";
  }
  if (LibMetric.isNumeric(dim) || LibMetric.isCoordinate(dim)) {
    return "int";
  }
  if (
    LibMetric.isState(dim) ||
    LibMetric.isCountry(dim) ||
    LibMetric.isCity(dim) ||
    LibMetric.isLocation(dim)
  ) {
    return "location";
  }
  return "unknown";
}

// ── Dimension type classification ──

function getDimensionType(dim: DimensionMetadata): MetricsViewerTabType | null {
  if (!isDimensionCandidate(dim)) {
    return null;
  }

  for (const config of TAB_TYPE_REGISTRY) {
    if (config.dimensionPredicate(dim)) {
      return config.type;
    }
  }

  return null;
}

type DimensionInfo = {
  dimension: DimensionMetadata;
  name: string;
  displayName: string;
  type: MetricsViewerTabType;
};

export function getDimensionsByType(
  def: MetricDefinition,
): Map<string, DimensionInfo> {
  const result = new Map<string, DimensionInfo>();
  const dims = LibMetric.projectionableDimensions(def);

  for (const dim of dims) {
    const info = LibMetric.displayInfo(def, dim);

    if (!isDimensionCandidate(dim)) {
      continue;
    }

    const type = getDimensionType(dim);
    if (type === null) {
      continue;
    }

    const name = info.name;

    if (name && !result.has(name)) {
      result.set(name, {
        dimension: dim,
        name,
        displayName: info.displayName,
        type,
      });
    }
  }

  return result;
}

// ── Stored tab creation ──

function classifyDimensionsBySource(
  definitionsBySourceId: Record<MetricSourceId, MetricDefinition | null>,
  sourceOrder: MetricSourceId[],
): Map<MetricSourceId, Map<string, DimensionInfo>> {
  const dimsBySource = new Map<MetricSourceId, Map<string, DimensionInfo>>();

  for (const sourceId of sourceOrder) {
    const def = definitionsBySourceId[sourceId];
    if (!def) {
      continue;
    }
    dimsBySource.set(sourceId, getDimensionsByType(def));
  }

  return dimsBySource;
}

export function computeDefaultTabs(
  definitionsBySourceId: Record<MetricSourceId, MetricDefinition | null>,
  sourceOrder: MetricSourceId[],
): MetricsViewerTabState[] {
  const tabs: MetricsViewerTabState[] = [];

  if (sourceOrder.length === 0) {
    return tabs;
  }

  const dimsBySource = classifyDimensionsBySource(
    definitionsBySourceId,
    sourceOrder,
  );
  if (dimsBySource.size === 0) {
    return tabs;
  }

  for (const config of TAB_TYPE_REGISTRY) {
    if (!config.autoCreate) {
      continue;
    }

    if (tabs.length >= MAX_AUTO_TABS) {
      break;
    }

    if (config.matchMode === "aggregate") {
      const dimsBySourceRecord: Record<MetricSourceId, string> = {};

      if (config.dimensionRanker) {
        let targetRank = Infinity;
        for (const sourceId of sourceOrder) {
          const dims = dimsBySource.get(sourceId);
          if (!dims) {
            continue;
          }
          for (const [, info] of dims) {
            if (info.type === config.type) {
              const rank = config.dimensionRanker(info.dimension);
              if (rank < targetRank) {
                targetRank = rank;
              }
            }
          }
        }

        for (const sourceId of sourceOrder) {
          const dims = dimsBySource.get(sourceId);
          if (!dims) {
            continue;
          }
          for (const [, info] of dims) {
            if (info.type === config.type) {
              const rank = config.dimensionRanker(info.dimension);
              if (rank === targetRank) {
                dimsBySourceRecord[sourceId] = info.name;
                break;
              }
            }
          }
        }
      } else {
        for (const sourceId of sourceOrder) {
          const dims = dimsBySource.get(sourceId);
          if (!dims) {
            continue;
          }
          for (const [, info] of dims) {
            if (info.type === config.type) {
              dimsBySourceRecord[sourceId] = info.name;
              break;
            }
          }
        }
      }

      if (Object.keys(dimsBySourceRecord).length > 0) {
        tabs.push({
          id: config.fixedId!,
          type: config.type,
          label: config.fixedLabel!,
          display: config.defaultDisplayType,
          definitions: sourceOrder.map((id) => ({
            definitionId: id,
            projectionDimensionId: dimsBySourceRecord[id],
          })),
        });
      }
    } else {
      const uniqueDimensions = new Map<
        string,
        { displayName: string; sourceIds: MetricSourceId[] }
      >();

      for (const sourceId of sourceOrder) {
        const dims = dimsBySource.get(sourceId);
        if (!dims) {
          continue;
        }

        for (const [, info] of dims) {
          if (info.type === config.type) {
            const existing = uniqueDimensions.get(info.name);
            if (existing) {
              existing.sourceIds.push(sourceId);
            } else {
              uniqueDimensions.set(info.name, {
                displayName: info.displayName,
                sourceIds: [sourceId],
              });
            }
          }
        }
      }

      for (const [dimName, { displayName, sourceIds }] of uniqueDimensions) {
        if (tabs.length >= MAX_AUTO_TABS) {
          break;
        }

        const dimsBySourceRecord: Record<MetricSourceId, string> = {};
        for (const sourceId of sourceIds) {
          dimsBySourceRecord[sourceId] = dimName;
        }

        tabs.push({
          id: dimName,
          type: config.type,
          label: displayName,
          display: config.defaultDisplayType,
          definitions: sourceOrder.map((id) => ({
            definitionId: id,
            projectionDimensionId: dimsBySourceRecord[id],
          })),
        });
      }
    }
  }

  return tabs;
}

export function createTabFromDimension(
  dimensionName: string,
  definitionsBySourceId: Record<MetricSourceId, MetricDefinition | null>,
  sourceOrder: MetricSourceId[],
): MetricsViewerTabState | null {
  const dimsBySourceRecord: Record<MetricSourceId, string> = {};
  let tabType: MetricsViewerTabType = "category";
  let displayName: string | null = null;

  for (const sourceId of sourceOrder) {
    const def = definitionsBySourceId[sourceId];
    if (!def) {
      continue;
    }

    const dims = getDimensionsByType(def);
    const dimInfo = dims.get(dimensionName);
    if (dimInfo) {
      dimsBySourceRecord[sourceId] = dimensionName;
      tabType = dimInfo.type;
      if (!displayName) {
        displayName = dimInfo.displayName;
      }
    }
  }

  if (Object.keys(dimsBySourceRecord).length === 0) {
    return null;
  }

  return {
    id: dimensionName,
    type: tabType,
    label: displayName ?? dimensionName,
    display: getTabConfig(tabType).defaultDisplayType,
    definitions: sourceOrder.map((id) => ({
      definitionId: id,
      projectionDimensionId: dimsBySourceRecord[id],
    })),
  };
}

function findExistingTabRank(
  tab: StoredMetricsViewerTab,
  dimensionRanker: (dim: DimensionMetadata) => number,
  baseDefinitions?: Record<MetricSourceId, MetricDefinition | null>,
): number | null {
  if (!baseDefinitions) {
    return null;
  }

  for (const [sourceId, dimName] of getObjectEntries(tab.dimensionsBySource)) {
    const def = baseDefinitions[sourceId];
    if (!def) {
      continue;
    }
    const dims = getDimensionsByType(def);
    const dimInfo = dims.get(dimName);
    if (dimInfo) {
      return dimensionRanker(dimInfo.dimension);
    }
  }
  return null;
}

function findBestRankInDimensions(
  dimsByType: Map<string, DimensionInfo>,
  tabType: MetricsViewerTabType,
  dimensionRanker: (dim: DimensionMetadata) => number,
): number | null {
  let best: number | null = null;
  for (const [, info] of dimsByType) {
    if (info.type === tabType) {
      const rank = dimensionRanker(info.dimension);
      if (best === null || rank < best) {
        best = rank;
      }
    }
  }
  return best;
}

export function findMatchingDimensionForTab(
  def: MetricDefinition,
  tab: StoredMetricsViewerTab,
  baseDefinitions?: Record<MetricSourceId, MetricDefinition | null>,
): string | null {
  const dimsByType = getDimensionsByType(def);
  const config = TAB_TYPE_REGISTRY.find((c) => c.type === tab.type);

  if (config?.matchMode === "aggregate") {
    if (config.dimensionRanker) {
      let targetRank = findExistingTabRank(
        tab,
        config.dimensionRanker,
        baseDefinitions,
      );

      if (targetRank === null) {
        targetRank = findBestRankInDimensions(
          dimsByType,
          config.type,
          config.dimensionRanker,
        );
      }

      if (targetRank !== null) {
        for (const [, info] of dimsByType) {
          if (
            info.type === config.type &&
            config.dimensionRanker(info.dimension) === targetRank
          ) {
            return info.name;
          }
        }
      }
      return null;
    }

    for (const [, info] of dimsByType) {
      if (info.type === tab.type) {
        return info.name;
      }
    }
    return null;
  }

  const matchingDim = dimsByType.get(tab.id);
  if (matchingDim && matchingDim.type === tab.type) {
    return matchingDim.name;
  }

  return null;
}

export interface AvailableDimension {
  dimensionName: string;
  label: string;
  icon: IconName;
  sourceIds: MetricSourceId[];
  tabType: MetricsViewerTabType;
}

export interface AvailableDimensionsResult {
  shared: AvailableDimension[];
  bySource: Record<MetricSourceId, AvailableDimension[]>;
}

export function getAvailableDimensionsForPicker(
  definitionsBySourceId: Record<MetricSourceId, MetricDefinition | null>,
  sourceOrder: MetricSourceId[],
  existingTabIds: Set<string>,
): AvailableDimensionsResult {
  const result: AvailableDimensionsResult = {
    shared: [],
    bySource: {},
  };

  if (sourceOrder.length === 0) {
    return result;
  }

  const allDimsBySource = new Map<
    MetricSourceId,
    Map<
      string,
      {
        dimension: DimensionMetadata;
        label: string;
        icon: IconName;
        tabType: MetricsViewerTabType;
      }
    >
  >();

  for (const sourceId of sourceOrder) {
    const def = definitionsBySourceId[sourceId];
    if (!def) {
      continue;
    }

    const dimsMap = new Map<
      string,
      {
        dimension: DimensionMetadata;
        label: string;
        icon: IconName;
        tabType: MetricsViewerTabType;
      }
    >();
    const projDims = LibMetric.projectionableDimensions(def);

    for (const dim of projDims) {
      if (!isDimensionCandidate(dim)) {
        continue;
      }

      const info = LibMetric.displayInfo(def, dim);
      const dimensionName = info.name;

      if (!dimensionName || existingTabIds.has(dimensionName)) {
        continue;
      }

      const tabType = getDimensionType(dim);
      if (!tabType) {
        continue;
      }

      if (!dimsMap.has(dimensionName)) {
        dimsMap.set(dimensionName, {
          dimension: dim,
          label: info.displayName ?? dimensionName,
          icon: getDimensionIcon(dim),
          tabType,
        });
      }
    }

    allDimsBySource.set(sourceId, dimsMap);
  }

  interface DimensionMeta {
    label: string;
    icon: IconName;
    tabType: MetricsViewerTabType;
    sourceIds: MetricSourceId[];
  }

  const dimensionMetas = new Map<string, DimensionMeta>();

  for (const [sourceId, dimensions] of allDimsBySource) {
    for (const [dimensionName, { label, icon, tabType }] of dimensions) {
      const existing = dimensionMetas.get(dimensionName);
      if (existing) {
        existing.sourceIds.push(sourceId);
      } else {
        dimensionMetas.set(dimensionName, {
          label,
          icon,
          tabType,
          sourceIds: [sourceId],
        });
      }
    }
  }

  const loadedSourceCount = allDimsBySource.size;
  const hasMultipleSources = loadedSourceCount > 1;

  const sharedDimNames = new Set<string>();
  if (hasMultipleSources) {
    for (const [dimensionName, meta] of dimensionMetas) {
      if (meta.sourceIds.length === loadedSourceCount) {
        sharedDimNames.add(dimensionName);
        result.shared.push({ dimensionName, ...meta });
      }
    }
    result.shared.sort((a, b) => a.label.localeCompare(b.label));
  }

  for (const sourceId of sourceOrder) {
    const dimensions = allDimsBySource.get(sourceId);
    if (!dimensions) {
      continue;
    }

    result.bySource[sourceId] = [];

    for (const [dimensionName, { label, icon, tabType }] of dimensions) {
      if (!hasMultipleSources || !sharedDimNames.has(dimensionName)) {
        result.bySource[sourceId].push({
          dimensionName,
          label,
          icon,
          sourceIds: [sourceId],
          tabType,
        });
      }
    }

    result.bySource[sourceId].sort((a, b) => a.label.localeCompare(b.label));
  }

  return result;
}

export interface SourceDisplayInfo {
  type: "metric" | "measure";
  name: string;
}

export function getSourceDisplayName(
  sourceId: MetricSourceId,
  sourceDataById: Record<MetricSourceId, SourceDisplayInfo>,
): string {
  return sourceDataById[sourceId]?.name ?? sourceId;
}
