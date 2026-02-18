import { getObjectEntries } from "metabase/lib/objects";
import type { IconName } from "metabase/ui";
import type {
  DimensionGroup,
  DimensionMetadata,
  MetricDefinition,
} from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

import { MAX_AUTO_TABS } from "../constants";
import {
  type MetricSourceId,
  type MetricsViewerTabState,
  type MetricsViewerTabType,
  type StoredMetricsViewerTab,
  getInitialMetricsViewerTabLayout,
} from "../types/viewer-state";

import { isDimensionCandidate } from "./metrics";
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
  id: string;
  name?: string;
  displayName: string;
  type: MetricsViewerTabType;
  group?: DimensionGroup;
};

export function getDimensionsByType(
  def: MetricDefinition,
): Map<string, DimensionInfo> {
  const result = new Map<string, DimensionInfo>();

  for (const dimension of LibMetric.projectionableDimensions(def)) {
    if (!isDimensionCandidate(dimension)) {
      continue;
    }

    const type = getDimensionType(dimension);
    if (!type) {
      continue;
    }

    const valuesInfo = LibMetric.dimensionValuesInfo(def, dimension);
    const displayInfo = LibMetric.displayInfo(def, dimension);
    if (!valuesInfo.id || result.has(valuesInfo.id)) {
      continue;
    }

    result.set(valuesInfo.id, {
      dimension,
      id: valuesInfo.id,
      name: displayInfo.name,
      displayName: displayInfo.displayName,
      type,
      group: displayInfo.group,
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
        mapping[sourceId] = match.id;
      }
    }

    return mapping;
  }

  let referenceDimension: DimensionMetadata | null = null;
  let referenceName: string | null = null;

  for (const sourceId of sourceOrder) {
    const dimensions = dimsBySource.get(sourceId);
    if (!dimensions) {
      continue;
    }

    let match: DimensionInfo | null = null;

    if (referenceDimension) {
      let nameMatch: DimensionInfo | null = null;

      for (const [, info] of dimensions) {
        if (info.type !== config.type) {
          continue;
        }
        if (LibMetric.isSameSource(info.dimension, referenceDimension)) {
          match = info;
          break;
        }
        if (!nameMatch && referenceName && info.name === referenceName) {
          nameMatch = info;
        }
      }

      match ??= nameMatch;
    }

    match ??= findFirstDimOfType(dimensions, config.type);

    if (match) {
      mapping[sourceId] = match.id;
      referenceDimension ??= match.dimension;
      referenceName ??= match.name ?? null;
    }
  }

  return mapping;
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
    const dimensions = dimsBySource.get(sourceId);
    if (!dimensions) {
      continue;
    }

    for (const [, info] of dimensions) {
      if (info.type !== type) {
        continue;
      }

      const existing = unique.get(info.id);
      if (existing) {
        existing.sourceIds.push(sourceId);
      } else {
        unique.set(info.id, {
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
        dimensionMapping: mapping,
        projectionConfig: {},
        layout: getInitialMetricsViewerTabLayout(config.defaultDisplayType),
      });
      continue;
    }

    const uniqueDims = collectUniqueExactDimensions(
      dimsBySource,
      sourceOrder,
      config.type,
    );

    for (const [dimensionId, { displayName, sourceIds }] of uniqueDims) {
      if (tabs.length >= MAX_AUTO_TABS) {
        break;
      }

      const mapping: Record<MetricSourceId, string> = {};
      for (const sourceId of sourceIds) {
        mapping[sourceId] = dimensionId;
      }

      tabs.push({
        id: dimensionId,
        type: config.type,
        label: displayName,
        display: config.defaultDisplayType,
        dimensionMapping: mapping,
        projectionConfig: {},
        layout: getInitialMetricsViewerTabLayout(config.defaultDisplayType),
      });
    }
  }

  return tabs;
}

// ── Manual tab creation ──

export function createTabFromDimension(
  dimensionId: string,
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

    const dimensionInfo = getDimensionsByType(def).get(dimensionId);
    if (!dimensionInfo) {
      continue;
    }

    mapping[sourceId] = dimensionId;
    tabType = dimensionInfo.type;
    displayName ??= dimensionInfo.displayName;
  }

  if (Object.keys(mapping).length === 0) {
    return null;
  }

  const display = getTabConfig(tabType).defaultDisplayType;

  return {
    id: dimensionId,
    type: tabType,
    label: displayName ?? dimensionId,
    display,
    dimensionMapping: mapping,
    projectionConfig: {},
    layout: getInitialMetricsViewerTabLayout(display),
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

function findDimensionByRank(
  dimensionsByType: Map<string, DimensionInfo>,
  config: (typeof TAB_TYPE_REGISTRY)[number],
  targetRank: number,
): string | null {
  for (const [, info] of dimensionsByType) {
    if (
      info.type === config.type &&
      config.dimensionRanker!(info.dimension) === targetRank
    ) {
      return info.id;
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

function findDimensionBySourceMatch(
  dimensionsByType: Map<string, DimensionInfo>,
  reference: DimensionInfo,
): string | null {
  let nameMatch: DimensionInfo | null = null;

  for (const [, info] of dimensionsByType) {
    if (info.type !== reference.type) {
      continue;
    }
    if (LibMetric.isSameSource(info.dimension, reference.dimension)) {
      return info.id;
    }
    if (!nameMatch && info.name === reference.name) {
      nameMatch = info;
    }
  }

  return nameMatch?.id ?? null;
}

export function findMatchingDimensionForTab(
  def: MetricDefinition,
  tab: StoredMetricsViewerTab,
  baseDefinitions?: Record<MetricSourceId, MetricDefinition | null>,
): string | null {
  const dimensionsByType = getDimensionsByType(def);
  const config = TAB_TYPE_REGISTRY.find((c) => c.type === tab.type);

  if (config?.matchMode !== "aggregate") {
    const exactMatch = dimensionsByType.get(tab.id);
    if (exactMatch?.type === tab.type) {
      return exactMatch.id;
    }

    const reference = findReferenceFromTab(tab, tab.type, baseDefinitions);
    if (reference) {
      return findDimensionBySourceMatch(dimensionsByType, reference);
    }

    return null;
  }

  const reference = findReferenceFromTab(tab, config.type, baseDefinitions);
  if (reference) {
    const match = findDimensionBySourceMatch(dimensionsByType, reference);
    if (match) {
      return match;
    }
  }

  if (!config.dimensionRanker) {
    return findFirstDimOfType(dimensionsByType, tab.type)?.id ?? null;
  }

  const targetRank =
    findExistingTabRank(tab, config.dimensionRanker, baseDefinitions) ??
    findBestRankInDimensions(
      dimensionsByType,
      config.type,
      config.dimensionRanker,
    );

  if (targetRank === null) {
    return null;
  }

  return findDimensionByRank(dimensionsByType, config, targetRank);
}

// ── Dimension picker ──

export interface AvailableDimension {
  dimensionId: string;
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

interface DimensionEntry {
  dimension: DimensionMetadata;
  id: string;
  label: string;
  icon: IconName;
  tabType: MetricsViewerTabType;
  group?: DimensionGroup;
  sourceId: MetricSourceId;
}

function collectAllDimensionEntries(
  sourceOrder: MetricSourceId[],
  definitionsBySourceId: Record<MetricSourceId, MetricDefinition | null>,
  existingTabIds: Set<string>,
): DimensionEntry[] {
  const entries: DimensionEntry[] = [];

  for (const sourceId of sourceOrder) {
    const def = definitionsBySourceId[sourceId];
    if (!def) {
      continue;
    }

    const seen = new Set<string>();
    for (const dimension of LibMetric.projectionableDimensions(def)) {
      if (!isDimensionCandidate(dimension)) {
        continue;
      }

      const valuesInfo = LibMetric.dimensionValuesInfo(def, dimension);
      if (
        !valuesInfo.id ||
        existingTabIds.has(valuesInfo.id) ||
        seen.has(valuesInfo.id)
      ) {
        continue;
      }

      const tabType = getDimensionType(dimension);
      if (!tabType) {
        continue;
      }
      seen.add(valuesInfo.id);

      const displayInfo = LibMetric.displayInfo(def, dimension);
      const label =
        displayInfo.displayName ?? displayInfo.name ?? valuesInfo.id;

      entries.push({
        dimension,
        id: valuesInfo.id,
        label,
        icon: getDimensionIcon(dimension),
        tabType,
        group: displayInfo.group,
        sourceId,
      });
    }
  }

  return entries;
}

function groupBySource(entries: DimensionEntry[]): DimensionEntry[][] {
  const groups: DimensionEntry[][] = [];

  for (const entry of entries) {
    const match = groups.find((g) =>
      g.some((e) => LibMetric.isSameSource(e.dimension, entry.dimension)),
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

  const entries = collectAllDimensionEntries(
    sourceOrder,
    definitionsBySourceId,
    existingTabIds,
  );
  const groups = groupBySource(entries);
  const loadedSourceCount = new Set(entries.map((entry) => entry.sourceId))
    .size;
  const hasMultipleSources = loadedSourceCount > 1;

  for (const group of groups) {
    const uniqueSources = [...new Set(group.map((entry) => entry.sourceId))];
    const first = group[0];

    if (hasMultipleSources && uniqueSources.length >= 2) {
      result.shared.push({
        dimensionId: first.id,
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
          dimensionId: entry.id,
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
