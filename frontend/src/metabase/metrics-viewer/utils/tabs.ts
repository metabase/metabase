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

import { GEO_SUBTYPE_PRIORITY } from "./metrics";
import type { TabTypeDefinition } from "./tab-config";
import { TAB_TYPE_REGISTRY, getTabConfig } from "./tab-config";

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

function getDimensionType(
  dimension: DimensionMetadata,
): MetricsViewerTabType | null {
  for (const config of TAB_TYPE_REGISTRY) {
    if (config.dimensionPredicate(dimension)) {
      return config.type;
    }
  }

  return null;
}

type ClassifiedDimension = {
  dimension: DimensionMetadata;
  id: string;
  name?: string;
  displayName: string;
  type: MetricsViewerTabType;
  group?: DimensionGroup;
  isDefault?: boolean;
  canListValues?: boolean;
};

export function getDimensionsByType(
  def: MetricDefinition,
): Map<string, ClassifiedDimension> {
  const result = new Map<string, ClassifiedDimension>();

  const defaultDimensionIds = new Set(
    LibMetric.defaultBreakoutDimensions(def)
      .map((dimension) => LibMetric.dimensionValuesInfo(def, dimension).id)
      .filter(Boolean),
  );

  for (const dimension of LibMetric.projectionableDimensions(def)) {
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
      isDefault: defaultDimensionIds.has(valuesInfo.id),
      canListValues: valuesInfo.canListValues,
    });
  }

  return result;
}

export function resolveCommonTabLabel(
  names: string[],
  fallback: string,
): string {
  if (names.length === 0) {
    return fallback;
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

function classifyDimensionsBySource(
  definitionsBySourceId: Record<MetricSourceId, MetricDefinition | null>,
  sourceOrder: MetricSourceId[],
): Map<MetricSourceId, Map<string, ClassifiedDimension>> {
  const result = new Map<MetricSourceId, Map<string, ClassifiedDimension>>();

  for (const sourceId of sourceOrder) {
    const def = definitionsBySourceId[sourceId];
    if (def) {
      result.set(sourceId, getDimensionsByType(def));
    }
  }

  return result;
}

function resolveTabDimensionNames(
  dimensionMapping: Record<MetricSourceId, string>,
  dimensionsBySource: Map<MetricSourceId, Map<string, ClassifiedDimension>>,
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
  dimensions: Map<string, ClassifiedDimension>,
  type: MetricsViewerTabType,
): ClassifiedDimension | null {
  for (const [, info] of dimensions) {
    if (info.type === type) {
      return info;
    }
  }
  return null;
}

function findDefaultDimensionOfType(
  dimensions: Map<string, ClassifiedDimension>,
  type: MetricsViewerTabType,
): ClassifiedDimension | null {
  for (const [, info] of dimensions) {
    if (info.type === type && info.isDefault) {
      return info;
    }
  }
  return null;
}

function findDimensionBySubtype(
  dimensions: Map<string, ClassifiedDimension>,
  type: MetricsViewerTabType,
  getSubtype: (dimension: DimensionMetadata) => string | null,
  targetSubtype: string,
): ClassifiedDimension | null {
  for (const [, info] of dimensions) {
    if (info.type === type && getSubtype(info.dimension) === targetSubtype) {
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
  dimensionsBySource: Map<MetricSourceId, Map<string, ClassifiedDimension>>,
  type: MetricsViewerTabType,
  getSubtype: (dimension: DimensionMetadata) => string | null,
): string | null {
  const found = new Set<string>();

  for (const [, dimensions] of dimensionsBySource) {
    for (const [, info] of dimensions) {
      if (info.type === type) {
        const subtype = getSubtype(info.dimension);
        if (subtype) {
          found.add(subtype);
        }
      }
    }
  }

  return pickBestGeoSubtype(found);
}

function findReferenceAcrossSources(
  dimensionsBySource: Map<MetricSourceId, Map<string, ClassifiedDimension>>,
  sourceOrder: MetricSourceId[],
  type: MetricsViewerTabType,
): { sourceId: MetricSourceId; dimension: ClassifiedDimension } | null {
  for (const sourceId of sourceOrder) {
    const dimensions = dimensionsBySource.get(sourceId);
    if (!dimensions) {
      continue;
    }
    const defaultDimension = findDefaultDimensionOfType(dimensions, type);
    if (defaultDimension) {
      return { sourceId, dimension: defaultDimension };
    }
  }
  return null;
}

function findSourceMatch(
  dimensions: Map<string, ClassifiedDimension>,
  type: MetricsViewerTabType,
  reference: ClassifiedDimension,
): ClassifiedDimension | null {
  let nameMatch: ClassifiedDimension | null = null;
  const referenceName = reference.name ?? null;

  for (const [, info] of dimensions) {
    if (info.type !== type) {
      continue;
    }
    if (LibMetric.isSameSource(info.dimension, reference.dimension)) {
      return info;
    }
    if (!nameMatch && referenceName && info.name === referenceName) {
      nameMatch = info;
    }
  }

  return nameMatch;
}

function resolveAggregateDimensionMapping(
  dimensionsBySource: Map<MetricSourceId, Map<string, ClassifiedDimension>>,
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
      findDefaultDimensionOfType(dimensions, config.type) ??
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
  dimensionsBySource: Map<MetricSourceId, Map<string, ClassifiedDimension>>,
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
      if (info.type !== type) {
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

  const dimensionsBySource = classifyDimensionsBySource(
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

      const fallbackLabel = config.fixedLabel ?? config.type;
      const names = resolveTabDimensionNames(mapping, dimensionsBySource);
      tabs.push({
        id: config.fixedId!,
        type: config.type,
        label: resolveCommonTabLabel(names, fallbackLabel),
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
      ([, a], [, b]) => {
        if (a.canListValues === b.canListValues) {
          return 0;
        }
        return a.canListValues ? -1 : 1;
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
      return getSubtype(dimensionInfo.dimension);
    }
  }

  return null;
}

function findBestSubtypeInDimensions(
  dimensionsByType: Map<string, ClassifiedDimension>,
  tabType: MetricsViewerTabType,
  getSubtype: (dimension: DimensionMetadata) => string | null,
): string | null {
  const found = new Set<string>();

  for (const [, info] of dimensionsByType) {
    if (info.type === tabType) {
      const subtype = getSubtype(info.dimension);
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
): ClassifiedDimension | null {
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
    if (dimensionInfo && dimensionInfo.type === type) {
      return dimensionInfo;
    }
  }

  return null;
}

function findDimensionBySourceMatch(
  dimensionsByType: Map<string, ClassifiedDimension>,
  reference: ClassifiedDimension,
  getSubtype?: (dimension: DimensionMetadata) => string | null,
): string | null {
  let nameMatch: ClassifiedDimension | null = null;

  for (const [, info] of dimensionsByType) {
    if (info.type !== reference.type) {
      continue;
    }
    if (LibMetric.isSameSource(info.dimension, reference.dimension)) {
      return info.id;
    }
    if (
      !nameMatch &&
      reference.name &&
      info.name?.toLowerCase() === reference.name.toLowerCase()
    ) {
      if (
        !getSubtype ||
        getSubtype(info.dimension) === getSubtype(reference.dimension)
      ) {
        nameMatch = info;
      }
    }
  }

  return nameMatch?.id ?? null;
}

function resolveSubtypeFallback(
  dimensionsByType: Map<string, ClassifiedDimension>,
  tab: StoredMetricsViewerTab,
  config: TabTypeDefinition,
  baseDefinitions?: Record<MetricSourceId, MetricDefinition | null>,
): string | null {
  const getSubtype = config.dimensionSubtype!;
  const targetSubtype =
    findSubtypeFromExistingTab(tab, getSubtype, baseDefinitions) ??
    findBestSubtypeInDimensions(dimensionsByType, config.type, getSubtype);

  if (!targetSubtype) {
    return null;
  }

  return (
    findDimensionBySubtype(
      dimensionsByType,
      config.type,
      getSubtype,
      targetSubtype,
    )?.id ?? null
  );
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

  return (
    findDefaultDimensionOfType(dimensionsByType, config.type)?.id ??
    (reference
      ? findDimensionBySourceMatch(
          dimensionsByType,
          reference,
          config.dimensionSubtype,
        )
      : null) ??
    (config.dimensionSubtype
      ? resolveSubtypeFallback(dimensionsByType, tab, config, baseDefinitions)
      : null) ??
    findDimensionOfType(dimensionsByType, tab.type)?.id ??
    null
  );
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
    const match = groups.find((group) =>
      group.some((existing) =>
        LibMetric.isSameSource(existing.dimension, entry.dimension),
      ),
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
