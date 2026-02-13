import { getObjectEntries } from "metabase/lib/objects";
import type { IconName } from "metabase/ui";
import type {
  DimensionGroup,
  DimensionMetadata,
  MetricDefinition,
} from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

import { MAX_AUTO_TABS } from "../constants";
import type {
  MetricSourceId,
  MetricsViewerTabState,
  MetricsViewerTabType,
  StoredMetricsViewerTab,
} from "../types/viewer-state";

import { isDimensionCandidate } from "./queries";
import { TAB_TYPE_REGISTRY, getTabConfig } from "./tab-config";

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
  group?: DimensionGroup;
};

export function getDimensionsByType(
  def: MetricDefinition,
): Map<string, DimensionInfo> {
  const result = new Map<string, DimensionInfo>();

  for (const dim of LibMetric.projectionableDimensions(def)) {
    if (!isDimensionCandidate(dim)) {
      continue;
    }

    const type = getDimensionType(dim);
    if (!type) {
      continue;
    }

    const info = LibMetric.displayInfo(def, dim);
    if (!info.name || result.has(info.name)) {
      continue;
    }

    result.set(info.name, {
      dimension: dim,
      name: info.name,
      displayName: info.displayName,
      type,
      group: info.group,
    });
  }

  return result;
}

// ── Default tab creation ──

function classifyDimensionsBySource(
  definitionsBySourceId: Record<MetricSourceId, MetricDefinition | null>,
  sourceOrder: MetricSourceId[],
): Map<MetricSourceId, Map<string, DimensionInfo>> {
  const result = new Map<MetricSourceId, Map<string, DimensionInfo>>();

  for (const sourceId of sourceOrder) {
    const def = definitionsBySourceId[sourceId];
    if (def) {
      result.set(sourceId, getDimensionsByType(def));
    }
  }

  return result;
}

function findFirstDimOfType(
  dims: Map<string, DimensionInfo>,
  type: MetricsViewerTabType,
): DimensionInfo | null {
  for (const [, info] of dims) {
    if (info.type === type) {
      return info;
    }
  }
  return null;
}

function findBestRankedDim(
  dims: Map<string, DimensionInfo>,
  type: MetricsViewerTabType,
  ranker: (dim: DimensionMetadata) => number,
  targetRank: number,
): DimensionInfo | null {
  for (const [, info] of dims) {
    if (info.type === type && ranker(info.dimension) === targetRank) {
      return info;
    }
  }
  return null;
}

function computeBestRank(
  dimsBySource: Map<MetricSourceId, Map<string, DimensionInfo>>,
  type: MetricsViewerTabType,
  ranker: (dim: DimensionMetadata) => number,
): number {
  let best = Infinity;

  for (const [, dims] of dimsBySource) {
    for (const [, info] of dims) {
      if (info.type === type) {
        best = Math.min(best, ranker(info.dimension));
      }
    }
  }

  return best;
}

function resolveAggregateDimensions(
  dimsBySource: Map<MetricSourceId, Map<string, DimensionInfo>>,
  sourceOrder: MetricSourceId[],
  config: (typeof TAB_TYPE_REGISTRY)[number],
): Record<MetricSourceId, string> {
  const mapping: Record<MetricSourceId, string> = {};

  if (config.dimensionRanker) {
    const targetRank = computeBestRank(
      dimsBySource,
      config.type,
      config.dimensionRanker,
    );
    if (targetRank === Infinity) {
      return mapping;
    }

    for (const sourceId of sourceOrder) {
      const dims = dimsBySource.get(sourceId);
      if (!dims) {
        continue;
      }
      const match = findBestRankedDim(
        dims,
        config.type,
        config.dimensionRanker,
        targetRank,
      );
      if (match) {
        mapping[sourceId] = match.name;
      }
    }

    return mapping;
  }

  let referenceDim: DimensionMetadata | null = null;
  let referenceName: string | null = null;

  for (const sourceId of sourceOrder) {
    const dims = dimsBySource.get(sourceId);
    if (!dims) {
      continue;
    }

    let match: DimensionInfo | null = null;

    if (referenceDim) {
      let nameMatch: DimensionInfo | null = null;

      for (const [, info] of dims) {
        if (info.type !== config.type) {
          continue;
        }
        if (LibMetric.isSameSource(info.dimension, referenceDim)) {
          match = info;
          break;
        }
        if (!nameMatch && referenceName && info.name === referenceName) {
          nameMatch = info;
        }
      }

      match ??= nameMatch;
    }

    match ??= findFirstDimOfType(dims, config.type);

    if (match) {
      mapping[sourceId] = match.name;
      referenceDim ??= match.dimension;
      referenceName ??= match.name;
    }
  }

  return mapping;
}

function buildTabDefinitions(
  sourceOrder: MetricSourceId[],
  dimensionMapping: Record<MetricSourceId, string>,
): MetricsViewerTabState["definitions"] {
  return sourceOrder.map((id) => ({
    definitionId: id,
    projectionDimensionId: dimensionMapping[id],
  }));
}

function collectUniqueExactDimensions(
  dimsBySource: Map<MetricSourceId, Map<string, DimensionInfo>>,
  sourceOrder: MetricSourceId[],
  type: MetricsViewerTabType,
): Map<string, { displayName: string; sourceIds: MetricSourceId[] }> {
  const unique = new Map<
    string,
    { displayName: string; sourceIds: MetricSourceId[] }
  >();

  for (const sourceId of sourceOrder) {
    const dims = dimsBySource.get(sourceId);
    if (!dims) {
      continue;
    }

    for (const [, info] of dims) {
      if (info.type !== type) {
        continue;
      }

      const existing = unique.get(info.name);
      if (existing) {
        existing.sourceIds.push(sourceId);
      } else {
        unique.set(info.name, {
          displayName: info.displayName,
          sourceIds: [sourceId],
        });
      }
    }
  }

  return unique;
}

export function computeDefaultTabs(
  definitionsBySourceId: Record<MetricSourceId, MetricDefinition | null>,
  sourceOrder: MetricSourceId[],
): MetricsViewerTabState[] {
  if (sourceOrder.length === 0) {
    return [];
  }

  const dimsBySource = classifyDimensionsBySource(
    definitionsBySourceId,
    sourceOrder,
  );
  if (dimsBySource.size === 0) {
    return [];
  }

  const tabs: MetricsViewerTabState[] = [];

  for (const config of TAB_TYPE_REGISTRY) {
    if (!config.autoCreate || tabs.length >= MAX_AUTO_TABS) {
      continue;
    }

    if (config.matchMode === "aggregate") {
      const mapping = resolveAggregateDimensions(
        dimsBySource,
        sourceOrder,
        config,
      );
      if (Object.keys(mapping).length === 0) {
        continue;
      }

      tabs.push({
        id: config.fixedId!,
        type: config.type,
        label: config.fixedLabel!,
        display: config.defaultDisplayType,
        definitions: buildTabDefinitions(sourceOrder, mapping),
      });
      continue;
    }

    const uniqueDims = collectUniqueExactDimensions(
      dimsBySource,
      sourceOrder,
      config.type,
    );

    for (const [dimName, { displayName, sourceIds }] of uniqueDims) {
      if (tabs.length >= MAX_AUTO_TABS) {
        break;
      }

      const mapping: Record<MetricSourceId, string> = {};
      for (const sourceId of sourceIds) {
        mapping[sourceId] = dimName;
      }

      tabs.push({
        id: dimName,
        type: config.type,
        label: displayName,
        display: config.defaultDisplayType,
        definitions: buildTabDefinitions(sourceOrder, mapping),
      });
    }
  }

  return tabs;
}

// ── Manual tab creation ──

export function createTabFromDimension(
  dimensionName: string,
  definitionsBySourceId: Record<MetricSourceId, MetricDefinition | null>,
  sourceOrder: MetricSourceId[],
): MetricsViewerTabState | null {
  const mapping: Record<MetricSourceId, string> = {};
  let tabType: MetricsViewerTabType = "category";
  let displayName: string | null = null;

  for (const sourceId of sourceOrder) {
    const def = definitionsBySourceId[sourceId];
    if (!def) {
      continue;
    }

    const dimInfo = getDimensionsByType(def).get(dimensionName);
    if (!dimInfo) {
      continue;
    }

    mapping[sourceId] = dimensionName;
    tabType = dimInfo.type;
    displayName ??= dimInfo.displayName;
  }

  if (Object.keys(mapping).length === 0) {
    return null;
  }

  return {
    id: dimensionName,
    type: tabType,
    label: displayName ?? dimensionName,
    display: getTabConfig(tabType).defaultDisplayType,
    definitions: buildTabDefinitions(sourceOrder, mapping),
  };
}

// ── Tab dimension matching ──

function findExistingTabRank(
  tab: StoredMetricsViewerTab,
  ranker: (dim: DimensionMetadata) => number,
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
    const dimInfo = getDimensionsByType(def).get(dimName);
    if (dimInfo) {
      return ranker(dimInfo.dimension);
    }
  }

  return null;
}

function findBestRankInDimensions(
  dimsByType: Map<string, DimensionInfo>,
  tabType: MetricsViewerTabType,
  ranker: (dim: DimensionMetadata) => number,
): number | null {
  let best: number | null = null;

  for (const [, info] of dimsByType) {
    if (info.type === tabType) {
      const rank = ranker(info.dimension);
      if (best === null || rank < best) {
        best = rank;
      }
    }
  }

  return best;
}

function findDimByRank(
  dimsByType: Map<string, DimensionInfo>,
  config: (typeof TAB_TYPE_REGISTRY)[number],
  targetRank: number,
): string | null {
  for (const [, info] of dimsByType) {
    if (
      info.type === config.type &&
      config.dimensionRanker!(info.dimension) === targetRank
    ) {
      return info.name;
    }
  }
  return null;
}

function findReferenceFromTab(
  tab: StoredMetricsViewerTab,
  type: MetricsViewerTabType,
  baseDefinitions?: Record<MetricSourceId, MetricDefinition | null>,
): DimensionInfo | null {
  if (!baseDefinitions) {
    return null;
  }

  for (const [sourceId, dimName] of getObjectEntries(tab.dimensionsBySource)) {
    const def = baseDefinitions[sourceId];
    if (!def) {
      continue;
    }
    const dimInfo = getDimensionsByType(def).get(dimName);
    if (dimInfo && dimInfo.type === type) {
      return dimInfo;
    }
  }

  return null;
}

export function findMatchingDimensionForTab(
  def: MetricDefinition,
  tab: StoredMetricsViewerTab,
  baseDefinitions?: Record<MetricSourceId, MetricDefinition | null>,
): string | null {
  const dimsByType = getDimensionsByType(def);
  const config = TAB_TYPE_REGISTRY.find((c) => c.type === tab.type);

  if (config?.matchMode !== "aggregate") {
    const matchingDim = dimsByType.get(tab.id);
    return matchingDim?.type === tab.type ? matchingDim.name : null;
  }

  if (!config.dimensionRanker) {
    const ref = findReferenceFromTab(tab, config.type, baseDefinitions);
    if (ref) {
      let nameMatch: DimensionInfo | null = null;
      for (const [, info] of dimsByType) {
        if (info.type !== config.type) {
          continue;
        }
        if (LibMetric.isSameSource(info.dimension, ref.dimension)) {
          return info.name;
        }
        if (!nameMatch && info.name === ref.name) {
          nameMatch = info;
        }
      }
      if (nameMatch) {
        return nameMatch.name;
      }
    }
    return findFirstDimOfType(dimsByType, tab.type)?.name ?? null;
  }

  const targetRank =
    findExistingTabRank(tab, config.dimensionRanker, baseDefinitions) ??
    findBestRankInDimensions(dimsByType, config.type, config.dimensionRanker);

  if (targetRank === null) {
    return null;
  }

  return findDimByRank(dimsByType, config, targetRank);
}

// ── Dimension picker ──

export interface AvailableDimension {
  dimensionName: string;
  label: string;
  icon: IconName;
  sourceIds: MetricSourceId[];
  tabType: MetricsViewerTabType;
  group?: DimensionGroup;
}

export interface AvailableDimensionsResult {
  shared: AvailableDimension[];
  bySource: Record<MetricSourceId, AvailableDimension[]>;
}

interface DimEntry {
  dim: DimensionMetadata;
  name: string;
  label: string;
  icon: IconName;
  tabType: MetricsViewerTabType;
  group?: DimensionGroup;
  sourceId: MetricSourceId;
}

function collectAllDimEntries(
  sourceOrder: MetricSourceId[],
  definitionsBySourceId: Record<MetricSourceId, MetricDefinition | null>,
  existingTabIds: Set<string>,
): DimEntry[] {
  const entries: DimEntry[] = [];

  for (const sourceId of sourceOrder) {
    const def = definitionsBySourceId[sourceId];
    if (!def) {
      continue;
    }

    const seen = new Set<string>();
    for (const dim of LibMetric.projectionableDimensions(def)) {
      if (!isDimensionCandidate(dim)) {
        continue;
      }

      const info = LibMetric.displayInfo(def, dim);
      if (!info.name || existingTabIds.has(info.name) || seen.has(info.name)) {
        continue;
      }

      const tabType = getDimensionType(dim);
      if (!tabType) {
        continue;
      }
      seen.add(info.name);

      const label = info.displayName ?? info.name;

      entries.push({
        dim,
        name: info.name,
        label,
        icon: getDimensionIcon(dim),
        tabType,
        group: info.group,
        sourceId,
      });
    }
  }

  return entries;
}

function groupBySource(entries: DimEntry[]): DimEntry[][] {
  const groups: DimEntry[][] = [];

  for (const entry of entries) {
    const match = groups.find(g =>
      g.some(e => LibMetric.isSameSource(e.dim, entry.dim)),
    );
    if (match) {
      match.push(entry);
    } else {
      groups.push([entry]);
    }
  }

  return groups;
}

export function getAvailableDimensionsForPicker(
  definitionsBySourceId: Record<MetricSourceId, MetricDefinition | null>,
  sourceOrder: MetricSourceId[],
  existingTabIds: Set<string>,
): AvailableDimensionsResult {
  const result: AvailableDimensionsResult = { shared: [], bySource: {} };

  if (sourceOrder.length === 0) {
    return result;
  }

  const entries = collectAllDimEntries(
    sourceOrder,
    definitionsBySourceId,
    existingTabIds,
  );
  const groups = groupBySource(entries);
  const loadedSourceCount = new Set(
    entries.map(e => e.sourceId),
  ).size;
  const hasMultipleSources = loadedSourceCount > 1;

  for (const group of groups) {
    const uniqueSources = [...new Set(group.map(e => e.sourceId))];
    const first = group[0];

    if (hasMultipleSources && uniqueSources.length >= 2) {
      result.shared.push({
        dimensionName: first.name,
        label: first.label,
        icon: first.icon,
        tabType: first.tabType,
        sourceIds: uniqueSources,
        group: first.group,
      });
    } else {
      for (const entry of group) {
        const arr = (result.bySource[entry.sourceId] ??= []);
        arr.push({
          dimensionName: entry.name,
          label: entry.label,
          icon: entry.icon,
          tabType: entry.tabType,
          sourceIds: [entry.sourceId],
          group: entry.group,
        });
      }
    }
  }

  result.shared.sort((a, b) => a.label.localeCompare(b.label));
  for (const sourceId of sourceOrder) {
    result.bySource[sourceId]?.sort((a, b) => a.label.localeCompare(b.label));
  }

  return result;
}

// ── Display helpers ──

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
