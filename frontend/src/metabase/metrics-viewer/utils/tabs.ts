import { t } from "ttag";

import type { DimensionDescriptor } from "metabase/metrics/common/utils/dimension-descriptors";
import { getDimensionDescriptors } from "metabase/metrics/common/utils/dimension-descriptors";
import { GEO_SUBTYPE_PRIORITY } from "metabase/metrics/common/utils/dimension-types";
import type { IconName } from "metabase/ui";
import { getObjectEntries } from "metabase/utils/objects";
import type { DimensionMetadata, MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

import { MAX_AUTO_TABS } from "../constants";
import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerTabState,
  MetricsViewerTabType,
  StoredMetricsViewerTab,
} from "../types/viewer-state";

import type { MetricSlot } from "./metric-slots";
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
  if (
    LibMetric.isCategory(dimension) ||
    LibMetric.isStringOrStringLike(dimension)
  ) {
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

/**
 * Recompute tab labels from the current dimension mappings.
 * Returns a new array only if at least one label changed.
 */
export function recomputeTabLabels(
  tabs: MetricsViewerTabState[],
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>,
  metricSlots: MetricSlot[],
): MetricsViewerTabState[] {
  const dimsBySlotIndex = new Map<
    number,
    Map<string, ViewerDimensionDescriptor>
  >();
  for (const slot of metricSlots) {
    const entry = definitions[slot.sourceId];
    if (entry?.definition) {
      dimsBySlotIndex.set(
        slot.slotIndex,
        getDimensionsByType(entry.definition),
      );
    }
  }

  let changed = false;
  const result = tabs.map((tab) => {
    const names = resolveTabDimensionNames(
      tab.dimensionMapping,
      dimsBySlotIndex,
    );
    const label = resolveCommonTabLabel(names);
    if (label != null && label !== tab.label) {
      changed = true;
      return { ...tab, label };
    }
    return tab;
  });

  return changed ? result : tabs;
}

// ── Default tab computation ──

function getDimensionDescriptorsBySlotIndex(
  definitionsBySourceId: Record<MetricSourceId, MetricDefinition | null>,
  metricSlots: MetricSlot[],
): Map<number, Map<string, DimensionDescriptor>> {
  const result = new Map<number, Map<string, DimensionDescriptor>>();

  for (const slot of metricSlots) {
    const def = definitionsBySourceId[slot.sourceId];
    if (def) {
      result.set(slot.slotIndex, getDimensionDescriptors(def));
    }
  }

  return result;
}

function resolveTabDimensionNames(
  dimensionMapping: Record<number, string | null>,
  dimensionsBySlotIndex: Map<number, Map<string, DimensionDescriptor>>,
): string[] {
  const names: string[] = [];

  for (const [key, dimensionId] of getObjectEntries(dimensionMapping)) {
    if (dimensionId == null) {
      continue;
    }
    const slotIndex = Number(key);
    const dimensionInfo = dimensionsBySlotIndex
      .get(slotIndex)
      ?.get(dimensionId);
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

function collectSubtypes(
  dimensions: Map<string, DimensionDescriptor>,
  type: MetricsViewerTabType,
  getSubtype: (dimension: DimensionMetadata) => string | null,
  into: Set<string>,
): void {
  for (const [, info] of dimensions) {
    if (info.dimensionType === type) {
      const subtype = getSubtype(info.dimensionMetadata);
      if (subtype) {
        into.add(subtype);
      }
    }
  }
}

function computeBestSubtypeAcrossSources(
  dimensionsByEntityIndex: Map<number, Map<string, DimensionDescriptor>>,
  type: MetricsViewerTabType,
  getSubtype: (dimension: DimensionMetadata) => string | null,
): string | null {
  const found = new Set<string>();
  for (const [, dimensions] of dimensionsByEntityIndex) {
    collectSubtypes(dimensions, type, getSubtype, found);
  }
  return pickBestGeoSubtype(found);
}

function findReferenceAcrossSources(
  dimensionsByEntityIndex: Map<number, Map<string, DimensionDescriptor>>,
  entityOrder: number[],
  type: MetricsViewerTabType,
): { entityIndex: number; dimension: DimensionDescriptor } | null {
  for (const entityIndex of entityOrder) {
    const dimensions = dimensionsByEntityIndex.get(entityIndex);
    if (!dimensions) {
      continue;
    }
    const defaultDimension = findDimensionOfType(dimensions, type, true);
    if (defaultDimension) {
      return { entityIndex, dimension: defaultDimension };
    }
  }
  return null;
}

/**
 * Find the best matching dimension in `dimensions` for a given `reference`.
 *
 * Match priority: exact source > case-insensitive name > compatible type.
 * When `getSubtype` is provided, name and type matches also require the
 * subtype to agree (used for geo dimension matching).
 */
function findSourceMatch(
  dimensions: Map<string, DimensionDescriptor>,
  type: MetricsViewerTabType,
  reference: DimensionDescriptor,
  getSubtype?: (dimension: DimensionMetadata) => string | null,
): DimensionDescriptor | null {
  let nameMatch: DimensionDescriptor | null = null;
  let typeMatch: DimensionDescriptor | null = null;
  const referenceName = reference.name.toLowerCase();

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
    if (
      !nameMatch &&
      referenceName &&
      info.name.toLowerCase() === referenceName
    ) {
      if (
        !getSubtype ||
        getSubtype(info.dimensionMetadata) ===
          getSubtype(reference.dimensionMetadata)
      ) {
        nameMatch = info;
      }
    }
    if (
      !typeMatch &&
      LibMetric.isCompatibleType(
        info.dimensionMetadata,
        reference.dimensionMetadata,
      )
    ) {
      if (
        !getSubtype ||
        getSubtype(info.dimensionMetadata) ===
          getSubtype(reference.dimensionMetadata)
      ) {
        typeMatch = info;
      }
    }
  }

  return nameMatch ?? typeMatch;
}

function resolveAggregateDimensionMapping(
  dimensionsByEntityIndex: Map<number, Map<string, DimensionDescriptor>>,
  entityOrder: number[],
  config: TabTypeDefinition,
): Record<number, string> {
  const mapping: Record<number, string> = {};

  if (config.dimensionSubtype) {
    const targetSubtype = computeBestSubtypeAcrossSources(
      dimensionsByEntityIndex,
      config.type,
      config.dimensionSubtype,
    );
    if (!targetSubtype) {
      return mapping;
    }

    for (const entityIndex of entityOrder) {
      const dimensions = dimensionsByEntityIndex.get(entityIndex);
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
        mapping[entityIndex] = match.id;
      }
    }

    return mapping;
  }

  const reference = findReferenceAcrossSources(
    dimensionsByEntityIndex,
    entityOrder,
    config.type,
  );

  if (reference) {
    mapping[reference.entityIndex] = reference.dimension.id;
  }

  for (const entityIndex of entityOrder) {
    if (mapping[entityIndex]) {
      continue;
    }

    const dimensions = dimensionsByEntityIndex.get(entityIndex);
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
      mapping[entityIndex] = match.id;
    }
  }

  return mapping;
}

function collectUniqueExactDimensions(
  dimensionsBySlotIndex: Map<number, Map<string, DimensionDescriptor>>,
  slotOrder: number[],
  type: MetricsViewerTabType,
): Map<
  string,
  {
    displayName: string;
    slotIndices: number[];
    canListValues: boolean;
    isPreferred: boolean | undefined;
  }
> {
  const unique = new Map<
    string,
    {
      displayName: string;
      slotIndices: number[];
      canListValues: boolean;
      isPreferred: boolean | undefined;
    }
  >();

  for (const slotIndex of slotOrder) {
    const dimensions = dimensionsBySlotIndex.get(slotIndex);
    if (!dimensions) {
      continue;
    }

    for (const [, info] of dimensions) {
      if (info.dimensionType !== type) {
        continue;
      }

      const existing = unique.get(info.id);
      if (existing) {
        existing.slotIndices.push(slotIndex);
        if (info.canListValues) {
          existing.canListValues = true;
        }
      } else {
        unique.set(info.id, {
          displayName: info.displayName,
          slotIndices: [slotIndex],
          canListValues: info.canListValues ?? false,
          isPreferred: info.isPreferred,
        });
      }
    }
  }

  return unique;
}

export function computeDefaultTabs(
  definitionsBySourceId: Record<MetricSourceId, MetricDefinition | null>,
  metricSlots: MetricSlot[],
): MetricsViewerTabState[] {
  if (metricSlots.length === 0) {
    return [];
  }

  const slotOrder = metricSlots.map((s) => s.slotIndex);

  const dimensionsBySlotIndex = getDimensionDescriptorsBySlotIndex(
    definitionsBySourceId,
    metricSlots,
  );
  if (dimensionsBySlotIndex.size === 0) {
    return [];
  }

  const tabs: (MetricsViewerTabState & { index?: number })[] = [];

  for (const config of TAB_TYPE_REGISTRY) {
    if (!config.autoCreate || tabs.length >= MAX_AUTO_TABS) {
      continue;
    }

    if (config.matchMode === "aggregate") {
      const mapping = resolveAggregateDimensionMapping(
        dimensionsBySlotIndex,
        slotOrder,
        config,
      );
      if (Object.keys(mapping).length < config.minDimensions) {
        continue;
      }

      const names = resolveTabDimensionNames(mapping, dimensionsBySlotIndex);
      tabs.push({
        id: config.fixedId,
        type: config.type,
        label:
          config.type === "scalar"
            ? getScalarTabLabel()
            : resolveCommonTabLabel(names),
        display: config.defaultDisplayType,
        dimensionMapping: mapping,
        projectionConfig: {},
        index: config.index,
      });
      continue;
    }

    const uniqueDimensions = collectUniqueExactDimensions(
      dimensionsBySlotIndex,
      slotOrder,
      config.type,
    );

    const filteredDimensions = [...uniqueDimensions.entries()].filter(
      ([, info]) => info.isPreferred !== false, // undefined is okay - means there is no preferred predicate
    );

    const sortedDimensions = filteredDimensions.sort(([, infoA], [, infoB]) => {
      if (infoA.canListValues === infoB.canListValues) {
        return 0;
      }
      return infoA.canListValues ? -1 : 1;
    });

    for (const [
      dimensionId,
      { displayName, slotIndices },
    ] of sortedDimensions) {
      if (tabs.length >= MAX_AUTO_TABS) {
        break;
      }

      const mapping: Record<number, string> = {};
      for (const slotIndex of slotIndices) {
        mapping[slotIndex] = dimensionId;
      }

      tabs.push({
        id: dimensionId,
        type: config.type,
        label: displayName,
        display: config.defaultDisplayType,
        dimensionMapping: mapping,
        projectionConfig: {},
        index: config.index,
      });
    }
  }

  tabs.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

  return tabs.map(({ index, ...tab }) => tab);
}

// ── Manual tab creation ──

export interface TabInfo {
  type: MetricsViewerTabType;
  label: string;
  dimensionMapping: Record<number, string>;
}

export function createTabFromTabInfo(
  tabInfo: TabInfo,
): MetricsViewerTabState | null {
  const { type, label, dimensionMapping } = tabInfo;
  if (type === "scalar") {
    return createScalarTab();
  }
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

function createScalarTab(): MetricsViewerTabState | null {
  const config = getTabConfig("scalar");
  if (config.matchMode !== "aggregate") {
    return null;
  }
  return {
    id: config.fixedId,
    type: config.type,
    label: getScalarTabLabel(),
    display: config.defaultDisplayType,
    dimensionMapping: {},
    projectionConfig: {},
  };
}

export function getScalarTabLabel() {
  return t`Totals`;
}

// ── Tab dimension matching ──

function findSubtypeFromExistingTab(
  tab: StoredMetricsViewerTab,
  getSubtype: (dimension: DimensionMetadata) => string | null,
  baseDefinitions?: Record<MetricSourceId, MetricDefinition | null>,
  slotIndexToSourceId?: Map<number, MetricSourceId>,
): string | null {
  if (!baseDefinitions || !slotIndexToSourceId) {
    return null;
  }

  for (const [key, dimensionName] of getObjectEntries(
    tab.dimensionBySlotIndex,
  )) {
    const slotIndex = Number(key);
    const sourceId = slotIndexToSourceId.get(slotIndex);
    if (!sourceId) {
      continue;
    }
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
  dimensions: Map<string, DimensionDescriptor>,
  tabType: MetricsViewerTabType,
  getSubtype: (dimension: DimensionMetadata) => string | null,
): string | null {
  const found = new Set<string>();
  collectSubtypes(dimensions, tabType, getSubtype, found);
  return pickBestGeoSubtype(found);
}

function findReferenceFromTab(
  tab: StoredMetricsViewerTab,
  type: MetricsViewerTabType,
  baseDefinitions?: Record<MetricSourceId, MetricDefinition | null>,
  slotIndexToSourceId?: Map<number, MetricSourceId>,
): DimensionDescriptor | null {
  if (!baseDefinitions || !slotIndexToSourceId) {
    return null;
  }

  for (const [key, dimensionName] of getObjectEntries(
    tab.dimensionBySlotIndex,
  )) {
    const entityIndex = Number(key);
    const sourceId = slotIndexToSourceId.get(entityIndex);
    if (!sourceId) {
      continue;
    }
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

function resolveSubtypeFallback(
  dimensionsByType: Map<string, DimensionDescriptor>,
  tabType: MetricsViewerTabType,
  getSubtype: (dimension: DimensionMetadata) => string | null,
  tab: StoredMetricsViewerTab,
  baseDefinitions?: Record<MetricSourceId, MetricDefinition | null>,
  slotIndexToSourceId?: Map<number, MetricSourceId>,
): string | null {
  const targetSubtype =
    findSubtypeFromExistingTab(
      tab,
      getSubtype,
      baseDefinitions,
      slotIndexToSourceId,
    ) ?? findBestSubtypeInDimensions(dimensionsByType, tabType, getSubtype);

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
  slotIndexToSourceId?: Map<number, MetricSourceId>,
): string | null {
  const exactMatch = dimensions.get(tab.id);
  if (exactMatch?.dimensionType === tab.type) {
    return exactMatch.id;
  }

  const reference = findReferenceFromTab(
    tab,
    tab.type,
    baseDefinitions,
    slotIndexToSourceId,
  );
  if (reference) {
    return findSourceMatch(dimensions, tab.type, reference)?.id ?? null;
  }

  return null;
}

function findAggregateMatch(
  dimensions: Map<string, DimensionDescriptor>,
  tab: StoredMetricsViewerTab,
  config: TabTypeDefinition,
  baseDefinitions?: Record<MetricSourceId, MetricDefinition | null>,
  slotIndexToSourceId?: Map<number, MetricSourceId>,
): string | null {
  const reference = findReferenceFromTab(
    tab,
    config.type,
    baseDefinitions,
    slotIndexToSourceId,
  );

  const defaultMatch = findDimensionOfType(dimensions, config.type, true);
  if (defaultMatch) {
    return defaultMatch.id;
  }

  if (reference) {
    const sourceMatch = findSourceMatch(
      dimensions,
      config.type,
      reference,
      config.dimensionSubtype,
    );
    if (sourceMatch) {
      return sourceMatch.id;
    }
  }

  if (config.dimensionSubtype) {
    const subtypeMatch = resolveSubtypeFallback(
      dimensions,
      config.type,
      config.dimensionSubtype,
      tab,
      baseDefinitions,
      slotIndexToSourceId,
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
  slotIndexToSourceId?: Map<number, MetricSourceId>,
): string | null {
  const dimensions = getDimensionsByType(def);
  const config = getTabConfig(tab.type);

  if (config?.matchMode !== "aggregate") {
    return findExactColumnMatch(
      dimensions,
      tab,
      baseDefinitions,
      slotIndexToSourceId,
    );
  }

  return findAggregateMatch(
    dimensions,
    tab,
    config,
    baseDefinitions,
    slotIndexToSourceId,
  );
}
