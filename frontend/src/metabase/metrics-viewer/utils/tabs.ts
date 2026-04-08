import { getObjectEntries } from "metabase/lib/objects";
import type { DimensionDescriptor } from "metabase/metrics/common/utils/dimension-descriptors";
import { getDimensionDescriptors } from "metabase/metrics/common/utils/dimension-descriptors";
import { GEO_SUBTYPE_PRIORITY } from "metabase/metrics/common/utils/dimension-types";
import type { IconName } from "metabase/ui";
import type { DimensionMetadata, MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

import { MAX_AUTO_TABS } from "../constants";
import type {
  MetricSourceId,
  MetricsViewerTabState,
  MetricsViewerTabType,
  StoredMetricsViewerTab,
} from "../types/viewer-state";

import {
  TAB_TYPE_REGISTRY,
  type TabTypeDefinition,
  getTabConfig,
} from "./tab-config";

// ── Dimension classification ──

export function getDimensionIcon(dimension: DimensionMetadata): IconName {
  if (LibMetric.isPrimaryKey(dimension)) {
    return "label";
  }
  if (LibMetric.isForeignKey(dimension)) {
    return "connections";
  }
  if (LibMetric.isBoolean(dimension)) {
    return "io";
  }
  if (LibMetric.isDateOrDateTime(dimension) || LibMetric.isTime(dimension)) {
    return "calendar";
  }
  if (LibMetric.isCategory(dimension)) {
    return "string";
  }
  if (LibMetric.isNumeric(dimension) || LibMetric.isCoordinate(dimension)) {
    return "int";
  }
  if (
    LibMetric.isState(dimension) ||
    LibMetric.isCountry(dimension) ||
    LibMetric.isCity(dimension) ||
    LibMetric.isLocation(dimension)
  ) {
    return "location";
  }
  return "unknown";
}

export type ViewerDimensionDescriptor = DimensionDescriptor & {
  icon: IconName;
};

const viewerDimensionsCache = new WeakMap<
  MetricDefinition,
  Map<string, ViewerDimensionDescriptor>
>();

export function getDimensionsByType(
  definition: MetricDefinition,
): Map<string, ViewerDimensionDescriptor> {
  const cached = viewerDimensionsCache.get(definition);
  if (cached) {
    return cached;
  }

  const descriptors = getDimensionDescriptors(definition);
  const result = new Map<string, ViewerDimensionDescriptor>();

  for (const [id, dimension] of descriptors) {
    result.set(id, {
      ...dimension,
      icon: getDimensionIcon(dimension.dimensionMetadata),
    });
  }

  viewerDimensionsCache.set(definition, result);
  return result;
}

export function resolveCommonTabLabel(names: string[]): string | null {
  if (names.length === 0) {
    return null;
  }
  if (names.length === 1 || names.every((name) => name === names[0])) {
    return names[0];
  }

  const counts = new Map<string, number>();
  for (const name of names) {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  let bestName = names[0];
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestName = name;
    }
  }

  return bestName;
}

// ── Default tab computation ──

function getDimensionDescriptorsBySource(
  definitionsBySourceId: Record<MetricSourceId, MetricDefinition | null>,
  sourceOrder: MetricSourceId[],
): Map<MetricSourceId, Map<string, DimensionDescriptor>> {
  const result = new Map<MetricSourceId, Map<string, DimensionDescriptor>>();

  for (const sourceId of sourceOrder) {
    const def = definitionsBySourceId[sourceId];
    if (def) {
      result.set(sourceId, getDimensionDescriptors(def));
    }
  }

  return result;
}

function resolveTabDimensionNames(
  dimensionMapping: Record<MetricSourceId, string>,
  dimensionsBySource: Map<MetricSourceId, Map<string, DimensionDescriptor>>,
): string[] {
  const names: string[] = [];

  for (const [sourceId, dimensionId] of getObjectEntries(dimensionMapping)) {
    const dimensionInfo = dimensionsBySource.get(sourceId)?.get(dimensionId);
    if (dimensionInfo) {
      names.push(dimensionInfo.displayName);
    }
  }

  return names;
}

function findDimensionOfType(
  dimensions: Map<string, DimensionDescriptor>,
  type: MetricsViewerTabType,
  requireDefault = false,
): DimensionDescriptor | null {
  for (const [, info] of dimensions) {
    if (info.dimensionType === type && (!requireDefault || info.isDefault)) {
      return info;
    }
  }
  return null;
}

function findDimensionBySubtype(
  dimensions: Map<string, DimensionDescriptor>,
  type: MetricsViewerTabType,
  getSubtype: (dimension: DimensionMetadata) => string | null,
  targetSubtype: string,
): DimensionDescriptor | null {
  for (const [, info] of dimensions) {
    if (
      info.dimensionType === type &&
      getSubtype(info.dimensionMetadata) === targetSubtype
    ) {
      return info;
    }
  }
  return null;
}

function pickBestGeoSubtype(found: Set<string>): string | null {
  for (const subtype of GEO_SUBTYPE_PRIORITY) {
    if (found.has(subtype)) {
      return subtype;
    }
  }
  return found.size > 0 ? (found.values().next().value ?? null) : null;
}

function computeBestSubtypeAcrossSources(
  dimensionsBySource: Map<MetricSourceId, Map<string, DimensionDescriptor>>,
  type: MetricsViewerTabType,
  getSubtype: (dimension: DimensionMetadata) => string | null,
): string | null {
  const found = new Set<string>();

  for (const [, dimensions] of dimensionsBySource) {
    for (const [, info] of dimensions) {
      if (info.dimensionType === type) {
        const subtype = getSubtype(info.dimensionMetadata);
        if (subtype) {
          found.add(subtype);
        }
      }
    }
  }

  return pickBestGeoSubtype(found);
}

function findReferenceAcrossSources(
  dimensionsBySource: Map<MetricSourceId, Map<string, DimensionDescriptor>>,
  sourceOrder: MetricSourceId[],
  type: MetricsViewerTabType,
): { sourceId: MetricSourceId; dimension: DimensionDescriptor } | null {
  for (const sourceId of sourceOrder) {
    const dimensions = dimensionsBySource.get(sourceId);
    if (!dimensions) {
      continue;
    }
    const defaultDimension = findDimensionOfType(dimensions, type, true);
    if (defaultDimension) {
      return { sourceId, dimension: defaultDimension };
    }
  }
  return null;
}

function findSourceMatch(
  dimensions: Map<string, DimensionDescriptor>,
  type: MetricsViewerTabType,
  reference: DimensionDescriptor,
): DimensionDescriptor | null {
  let nameMatch: DimensionDescriptor | null = null;
  const referenceName = reference.name;

  for (const [, info] of dimensions) {
    if (info.dimensionType !== type) {
      continue;
    }
    if (
      LibMetric.isSameSource(
        info.dimensionMetadata,
        reference.dimensionMetadata,
      )
    ) {
      return info;
    }
    if (!nameMatch && referenceName && info.name === referenceName) {
      nameMatch = info;
    }
  }

  return nameMatch;
}

function resolveAggregateDimensionMapping(
  dimensionsBySource: Map<MetricSourceId, Map<string, DimensionDescriptor>>,
  sourceOrder: MetricSourceId[],
  config: TabTypeDefinition,
): Record<MetricSourceId, string> {
  const mapping: Record<MetricSourceId, string> = {};

  if (config.dimensionSubtype) {
    const targetSubtype = computeBestSubtypeAcrossSources(
      dimensionsBySource,
      config.type,
      config.dimensionSubtype,
    );
    if (!targetSubtype) {
      return mapping;
    }

    for (const sourceId of sourceOrder) {
      const dimensions = dimensionsBySource.get(sourceId);
      if (!dimensions) {
        continue;
      }
      const match = findDimensionBySubtype(
        dimensions,
        config.type,
        config.dimensionSubtype,
        targetSubtype,
      );
      if (match) {
        mapping[sourceId] = match.id;
      }
    }

    return mapping;
  }

  const reference = findReferenceAcrossSources(
    dimensionsBySource,
    sourceOrder,
    config.type,
  );

  if (reference) {
    mapping[reference.sourceId] = reference.dimension.id;
  }

  for (const sourceId of sourceOrder) {
    if (mapping[sourceId]) {
      continue;
    }

    const dimensions = dimensionsBySource.get(sourceId);
    if (!dimensions) {
      continue;
    }

    const match =
      findDimensionOfType(dimensions, config.type, true) ??
      (reference
        ? findSourceMatch(dimensions, config.type, reference.dimension)
        : null) ??
      findDimensionOfType(dimensions, config.type);

    if (match) {
      mapping[sourceId] = match.id;
    }
  }

  return mapping;
}

function collectUniqueExactDimensions(
  dimensionsBySource: Map<MetricSourceId, Map<string, DimensionDescriptor>>,
  sourceOrder: MetricSourceId[],
  type: MetricsViewerTabType,
): Map<
  string,
  { displayName: string; sourceIds: MetricSourceId[]; canListValues: boolean }
> {
  const unique = new Map<
    string,
    {
      displayName: string;
      sourceIds: MetricSourceId[];
      canListValues: boolean;
    }
  >();

  for (const sourceId of sourceOrder) {
    const dimensions = dimensionsBySource.get(sourceId);
    if (!dimensions) {
      continue;
    }

    for (const [, info] of dimensions) {
      if (info.dimensionType !== type) {
        continue;
      }

      const existing = unique.get(info.id);
      if (existing) {
        existing.sourceIds.push(sourceId);
        if (info.canListValues) {
          existing.canListValues = true;
        }
      } else {
        unique.set(info.id, {
          displayName: info.displayName,
          sourceIds: [sourceId],
          canListValues: info.canListValues ?? false,
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

  const dimensionsBySource = getDimensionDescriptorsBySource(
    definitionsBySourceId,
    sourceOrder,
  );
  if (dimensionsBySource.size === 0) {
    return [];
  }

  const tabs: MetricsViewerTabState[] = [];

  for (const config of TAB_TYPE_REGISTRY) {
    if (!config.autoCreate || tabs.length >= MAX_AUTO_TABS) {
      continue;
    }

    if (config.matchMode === "aggregate") {
      const mapping = resolveAggregateDimensionMapping(
        dimensionsBySource,
        sourceOrder,
        config,
      );
      if (Object.keys(mapping).length === 0) {
        continue;
      }

      const names = resolveTabDimensionNames(mapping, dimensionsBySource);
      tabs.push({
        id: config.fixedId,
        type: config.type,
        label: resolveCommonTabLabel(names),
        display: config.defaultDisplayType,
        dimensionMapping: mapping,
        projectionConfig: {},
      });
      continue;
    }

    const uniqueDimensions = collectUniqueExactDimensions(
      dimensionsBySource,
      sourceOrder,
      config.type,
    );

    const sortedDimensions = [...uniqueDimensions.entries()].sort(
      ([, infoA], [, infoB]) => {
        if (infoA.canListValues === infoB.canListValues) {
          return 0;
        }
        return infoA.canListValues ? -1 : 1;
      },
    );

    for (const [dimensionId, { displayName, sourceIds }] of sortedDimensions) {
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
      });
    }
  }

  return tabs;
}

// ── Manual tab creation ──

export interface TabInfo {
  type: MetricsViewerTabType;
  label: string;
  dimensionMapping: Record<MetricSourceId, string>;
}

export function createTabFromTabInfo(
  tabInfo: TabInfo,
): MetricsViewerTabState | null {
  const { type, label, dimensionMapping } = tabInfo;
  const id = Object.values(dimensionMapping)[0];
  if (id == null) {
    return null;
  }
  const display = getTabConfig(type).defaultDisplayType;
  return {
    id,
    type,
    label,
    display,
    dimensionMapping,
    projectionConfig: {},
  };
}

// ── Tab dimension matching ──

function findSubtypeFromExistingTab(
  tab: StoredMetricsViewerTab,
  getSubtype: (dimension: DimensionMetadata) => string | null,
  baseDefinitions?: Record<MetricSourceId, MetricDefinition | null>,
): string | null {
  if (!baseDefinitions) {
    return null;
  }

  for (const [sourceId, dimensionName] of getObjectEntries(
    tab.dimensionsBySource,
  )) {
    const def = baseDefinitions[sourceId];
    if (!def) {
      continue;
    }
    const dimensionInfo = getDimensionsByType(def).get(dimensionName);
    if (dimensionInfo) {
      return getSubtype(dimensionInfo.dimensionMetadata);
    }
  }

  return null;
}

function findBestSubtypeInDimensions(
  dimensionsByType: Map<string, DimensionDescriptor>,
  tabType: MetricsViewerTabType,
  getSubtype: (dimension: DimensionMetadata) => string | null,
): string | null {
  const found = new Set<string>();

  for (const [, info] of dimensionsByType) {
    if (info.dimensionType === tabType) {
      const subtype = getSubtype(info.dimensionMetadata);
      if (subtype) {
        found.add(subtype);
      }
    }
  }

  return pickBestGeoSubtype(found);
}

function findReferenceFromTab(
  tab: StoredMetricsViewerTab,
  type: MetricsViewerTabType,
  baseDefinitions?: Record<MetricSourceId, MetricDefinition | null>,
): DimensionDescriptor | null {
  if (!baseDefinitions) {
    return null;
  }

  for (const [sourceId, dimensionName] of getObjectEntries(
    tab.dimensionsBySource,
  )) {
    const def = baseDefinitions[sourceId];
    if (!def) {
      continue;
    }
    const dimensionInfo = getDimensionsByType(def).get(dimensionName);
    if (dimensionInfo && dimensionInfo.dimensionType === type) {
      return dimensionInfo;
    }
  }

  return null;
}

function findDimensionBySourceMatch(
  dimensionsByType: Map<string, DimensionDescriptor>,
  reference: DimensionDescriptor,
  getSubtype?: (dimension: DimensionMetadata) => string | null,
): string | null {
  let nameMatch: DimensionDescriptor | null = null;

  for (const [, info] of dimensionsByType) {
    if (info.dimensionType !== reference.dimensionType) {
      continue;
    }
    if (
      LibMetric.isSameSource(
        info.dimensionMetadata,
        reference.dimensionMetadata,
      )
    ) {
      return info.id;
    }
    if (
      !nameMatch &&
      info.name.toLowerCase() === reference.name.toLowerCase()
    ) {
      if (
        !getSubtype ||
        getSubtype(info.dimensionMetadata) ===
          getSubtype(reference.dimensionMetadata)
      ) {
        nameMatch = info;
      }
    }
  }

  return nameMatch?.id ?? null;
}

function resolveSubtypeFallback(
  dimensionsByType: Map<string, DimensionDescriptor>,
  tabType: MetricsViewerTabType,
  getSubtype: (dimension: DimensionMetadata) => string | null,
  tab: StoredMetricsViewerTab,
  baseDefinitions?: Record<MetricSourceId, MetricDefinition | null>,
): string | null {
  const targetSubtype =
    findSubtypeFromExistingTab(tab, getSubtype, baseDefinitions) ??
    findBestSubtypeInDimensions(dimensionsByType, tabType, getSubtype);

  if (!targetSubtype) {
    return null;
  }

  return (
    findDimensionBySubtype(dimensionsByType, tabType, getSubtype, targetSubtype)
      ?.id ?? null
  );
}

function findExactColumnMatch(
  dimensions: Map<string, DimensionDescriptor>,
  tab: StoredMetricsViewerTab,
  baseDefinitions?: Record<MetricSourceId, MetricDefinition | null>,
): string | null {
  const exactMatch = dimensions.get(tab.id);
  if (exactMatch?.dimensionType === tab.type) {
    return exactMatch.id;
  }

  const reference = findReferenceFromTab(tab, tab.type, baseDefinitions);
  if (reference) {
    return findDimensionBySourceMatch(dimensions, reference);
  }

  return null;
}

function findAggregateMatch(
  dimensions: Map<string, DimensionDescriptor>,
  tab: StoredMetricsViewerTab,
  config: TabTypeDefinition,
  baseDefinitions?: Record<MetricSourceId, MetricDefinition | null>,
): string | null {
  const reference = findReferenceFromTab(tab, config.type, baseDefinitions);

  const defaultMatch = findDimensionOfType(dimensions, config.type, true);
  if (defaultMatch) {
    return defaultMatch.id;
  }

  if (reference) {
    const sourceMatch = findDimensionBySourceMatch(
      dimensions,
      reference,
      config.dimensionSubtype,
    );
    if (sourceMatch) {
      return sourceMatch;
    }
  }

  if (config.dimensionSubtype) {
    const subtypeMatch = resolveSubtypeFallback(
      dimensions,
      config.type,
      config.dimensionSubtype,
      tab,
      baseDefinitions,
    );
    if (subtypeMatch) {
      return subtypeMatch;
    }
  }

  return findDimensionOfType(dimensions, config.type)?.id ?? null;
}

export function findMatchingDimensionForTab(
  def: MetricDefinition,
  tab: StoredMetricsViewerTab,
  baseDefinitions?: Record<MetricSourceId, MetricDefinition | null>,
): string | null {
  const dimensions = getDimensionsByType(def);
  const config = TAB_TYPE_REGISTRY.find((config) => config.type === tab.type);

  if (config?.matchMode !== "aggregate") {
    return findExactColumnMatch(dimensions, tab, baseDefinitions);
  }

  return findAggregateMatch(dimensions, tab, config, baseDefinitions);
}
