import { t } from "ttag";

import type { DimensionDescriptor } from "metabase/common/metrics/utils/dimension-descriptors";
import { getDimensionDescriptors } from "metabase/common/metrics/utils/dimension-descriptors";
import { GEO_SUBTYPE_PRIORITY } from "metabase/common/metrics/utils/dimension-types";
import { getObjectEntries, objectFromEntries } from "metabase/utils/objects";
import { isNotNull } from "metabase/utils/types";
import type { DimensionMetadata, MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { IconName } from "metabase-types/api";

import { MAX_AUTO_DIMENSION_BREAKOUTS } from "../constants";
import type {
  DimensionBreakoutInfo,
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerDimensionBreakoutState,
  MetricsViewerDimensionBreakoutType,
  MetricsViewerFormulaEntity,
  StoredMetricsViewerDimensionBreakout,
} from "../types";

import {
  DIMENSION_BREAKOUT_TYPE_REGISTRY,
  type DimensionBreakoutTypeDefinition,
  getDimensionBreakoutConfig,
} from "./dimension-breakout-config";
import { type MetricSlot, computeMetricSlots } from "./metric-slots";

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
    LibMetric.isState(dimension) ||
    LibMetric.isCountry(dimension) ||
    LibMetric.isCity(dimension) ||
    LibMetric.isLocation(dimension) ||
    LibMetric.isCoordinate(dimension)
  ) {
    return "location";
  }
  if (
    LibMetric.isCategory(dimension) ||
    LibMetric.isStringOrStringLike(dimension)
  ) {
    return "label";
  }
  if (LibMetric.isNumeric(dimension)) {
    return "int";
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

export function resolveCommonDimensionBreakoutLabel(
  names: string[],
): string | null {
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

export function getValidSelectedDimensionBreakoutId(
  currentSelectedDimensionBreakoutId: string | null,
  newDimensionBreakouts: MetricsViewerDimensionBreakoutState[],
): string | null {
  const selectedDimensionBreakoutExists = newDimensionBreakouts.some(
    (dimensionBreakout) =>
      dimensionBreakout.id === currentSelectedDimensionBreakoutId,
  );

  if (selectedDimensionBreakoutExists) {
    return currentSelectedDimensionBreakoutId;
  }

  return newDimensionBreakouts[0]?.id ?? null;
}

export function assignDimensionsForUnmappedSlots(
  dimensionBreakouts: MetricsViewerDimensionBreakoutState[],
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>,
  formulaEntities: MetricsViewerFormulaEntity[],
): MetricsViewerDimensionBreakoutState[] {
  const slots = computeMetricSlots(formulaEntities);
  if (slots.length === 0) {
    return dimensionBreakouts;
  }

  const slotIndexToSourceId = new Map<number, MetricSourceId>();
  for (const slot of slots) {
    slotIndexToSourceId.set(slot.slotIndex, slot.sourceId);
  }

  return dimensionBreakouts.map((dimensionBreakout) => {
    if (dimensionBreakout.label == null) {
      return dimensionBreakout;
    }

    const unmappedBySource = new Map<
      MetricSourceId,
      { slotIndices: number[]; definition: MetricDefinition }
    >();

    for (const slot of slots) {
      const existing = dimensionBreakout.dimensionMapping[slot.slotIndex];
      if (existing !== undefined) {
        continue;
      }
      const defEntry = definitions[slot.sourceId];
      if (!defEntry?.definition) {
        continue;
      }
      let group = unmappedBySource.get(slot.sourceId);
      if (!group) {
        group = { slotIndices: [], definition: defEntry.definition };
        unmappedBySource.set(slot.sourceId, group);
      }
      group.slotIndices.push(slot.slotIndex);
    }

    if (unmappedBySource.size === 0) {
      return dimensionBreakout;
    }

    const activeMappings: Record<number, string> = {};
    for (const [key, value] of getObjectEntries(
      dimensionBreakout.dimensionMapping,
    )) {
      if (value != null) {
        activeMappings[Number(key)] = value;
      }
    }
    const storedDimensionBreakout: StoredMetricsViewerDimensionBreakout = {
      id: dimensionBreakout.id,
      type: dimensionBreakout.type,
      label: dimensionBreakout.label,
      dimensionBySlotIndex: activeMappings,
    };

    let newMappings: Record<number, string> | null = null;

    for (const [sourceId, { slotIndices, definition }] of unmappedBySource) {
      const existingDefinitions = objectFromEntries(
        Object.values(definitions)
          .filter((entry) => entry.id !== sourceId && entry.definition != null)
          .map((entry) => [entry.id, entry.definition] as const),
      );

      const matchingDimension = findMatchingDimensionForBreakout(
        definition,
        storedDimensionBreakout,
        existingDefinitions,
        slotIndexToSourceId,
      );

      if (matchingDimension) {
        if (!newMappings) {
          newMappings = {};
        }
        for (const idx of slotIndices) {
          newMappings[idx] = matchingDimension;
        }
      }
    }

    if (!newMappings) {
      return dimensionBreakout;
    }

    return {
      ...dimensionBreakout,
      dimensionMapping: {
        ...dimensionBreakout.dimensionMapping,
        ...newMappings,
      },
    };
  });
}

export function areDimensionBreakoutDimensionsValid(
  dimensionBreakout: MetricsViewerDimensionBreakoutState,
): boolean {
  const dimensionBreakoutConfig = getDimensionBreakoutConfig(
    dimensionBreakout.type,
  );

  return (
    Object.values(dimensionBreakout.dimensionMapping).filter(isNotNull)
      .length >= dimensionBreakoutConfig.minDimensions
  );
}

// ── Default dimensionBreakout computation ──

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

function resolveDimensionBreakoutDimensionNames(
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
  type: MetricsViewerDimensionBreakoutType,
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
  type: MetricsViewerDimensionBreakoutType,
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
  type: MetricsViewerDimensionBreakoutType,
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
  type: MetricsViewerDimensionBreakoutType,
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
  type: MetricsViewerDimensionBreakoutType,
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
  type: MetricsViewerDimensionBreakoutType,
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
  config: DimensionBreakoutTypeDefinition,
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
  type: MetricsViewerDimensionBreakoutType,
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

export function computeDefaultDimensionBreakouts(
  definitionsBySourceId: Record<MetricSourceId, MetricDefinition | null>,
  metricSlots: MetricSlot[],
): MetricsViewerDimensionBreakoutState[] {
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

  const dimensionBreakouts: (MetricsViewerDimensionBreakoutState & {
    index?: number;
  })[] = [];

  for (const config of DIMENSION_BREAKOUT_TYPE_REGISTRY) {
    if (
      !config.autoCreate ||
      dimensionBreakouts.length >= MAX_AUTO_DIMENSION_BREAKOUTS
    ) {
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

      const names = resolveDimensionBreakoutDimensionNames(
        mapping,
        dimensionsBySlotIndex,
      );
      dimensionBreakouts.push({
        id: config.fixedId,
        type: config.type,
        label:
          config.type === "scalar"
            ? getScalarDimensionBreakoutLabel()
            : resolveCommonDimensionBreakoutLabel(names),
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
      if (dimensionBreakouts.length >= MAX_AUTO_DIMENSION_BREAKOUTS) {
        break;
      }

      const mapping: Record<number, string> = {};
      for (const slotIndex of slotIndices) {
        mapping[slotIndex] = dimensionId;
      }

      dimensionBreakouts.push({
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

  dimensionBreakouts.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

  return dimensionBreakouts.map(
    ({ index, ...dimensionBreakout }) => dimensionBreakout,
  );
}

// ── Manual dimensionBreakout creation ──

export function createDimensionBreakoutFromInfo(
  dimensionBreakoutInfo: DimensionBreakoutInfo,
): MetricsViewerDimensionBreakoutState | null {
  const {
    id: preferredId,
    type,
    label,
    dimensionMapping,
  } = dimensionBreakoutInfo;
  if (type === "scalar") {
    return createScalarDimensionBreakout();
  }
  const id =
    preferredId ??
    Object.values(dimensionMapping).find((dimensionId) => dimensionId != null);
  if (id == null) {
    return null;
  }
  const display = getDimensionBreakoutConfig(type).defaultDisplayType;
  return {
    id,
    type,
    label,
    display,
    dimensionMapping,
    projectionConfig: {},
  };
}

function createScalarDimensionBreakout(): MetricsViewerDimensionBreakoutState | null {
  const config = getDimensionBreakoutConfig("scalar");
  if (config.matchMode !== "aggregate") {
    return null;
  }
  return {
    id: config.fixedId,
    type: config.type,
    label: getScalarDimensionBreakoutLabel(),
    display: config.defaultDisplayType,
    dimensionMapping: {},
    projectionConfig: {},
  };
}

export function getScalarDimensionBreakoutLabel() {
  return t`Totals`;
}

// ── DimensionBreakout dimension matching ──

function findSubtypeFromExistingDimensionBreakout(
  dimensionBreakout: StoredMetricsViewerDimensionBreakout,
  getSubtype: (dimension: DimensionMetadata) => string | null,
  baseDefinitions?: Record<MetricSourceId, MetricDefinition | null>,
  slotIndexToSourceId?: Map<number, MetricSourceId>,
): string | null {
  if (!baseDefinitions || !slotIndexToSourceId) {
    return null;
  }

  for (const [key, dimensionName] of getObjectEntries(
    dimensionBreakout.dimensionBySlotIndex,
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
  dimensionBreakoutType: MetricsViewerDimensionBreakoutType,
  getSubtype: (dimension: DimensionMetadata) => string | null,
): string | null {
  const found = new Set<string>();
  collectSubtypes(dimensions, dimensionBreakoutType, getSubtype, found);
  return pickBestGeoSubtype(found);
}

function findReferenceFromDimensionBreakout(
  dimensionBreakout: StoredMetricsViewerDimensionBreakout,
  type: MetricsViewerDimensionBreakoutType,
  baseDefinitions?: Record<MetricSourceId, MetricDefinition | null>,
  slotIndexToSourceId?: Map<number, MetricSourceId>,
): DimensionDescriptor | null {
  if (!baseDefinitions || !slotIndexToSourceId) {
    return null;
  }

  for (const [key, dimensionName] of getObjectEntries(
    dimensionBreakout.dimensionBySlotIndex,
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
  dimensionBreakoutType: MetricsViewerDimensionBreakoutType,
  getSubtype: (dimension: DimensionMetadata) => string | null,
  dimensionBreakout: StoredMetricsViewerDimensionBreakout,
  baseDefinitions?: Record<MetricSourceId, MetricDefinition | null>,
  slotIndexToSourceId?: Map<number, MetricSourceId>,
): string | null {
  const targetSubtype =
    findSubtypeFromExistingDimensionBreakout(
      dimensionBreakout,
      getSubtype,
      baseDefinitions,
      slotIndexToSourceId,
    ) ??
    findBestSubtypeInDimensions(
      dimensionsByType,
      dimensionBreakoutType,
      getSubtype,
    );

  if (!targetSubtype) {
    return null;
  }

  return (
    findDimensionBySubtype(
      dimensionsByType,
      dimensionBreakoutType,
      getSubtype,
      targetSubtype,
    )?.id ?? null
  );
}

/**
 * Resolve a stored breakout to a dimension in `dimensions` by exact identity:
 * first by dimension id, then by matching an already-mapped slot's reference
 * and requiring a shared underlying source (same physical column/table) via
 * `LibMetric.isSameSource`.
 */
function findExactColumnMatch(
  dimensions: Map<string, DimensionDescriptor>,
  dimensionBreakout: StoredMetricsViewerDimensionBreakout,
  baseDefinitions?: Record<MetricSourceId, MetricDefinition | null>,
  slotIndexToSourceId?: Map<number, MetricSourceId>,
): string | null {
  const exactMatch = dimensions.get(dimensionBreakout.id);
  if (exactMatch?.dimensionType === dimensionBreakout.type) {
    return exactMatch.id;
  }

  const reference = findReferenceFromDimensionBreakout(
    dimensionBreakout,
    dimensionBreakout.type,
    baseDefinitions,
    slotIndexToSourceId,
  );
  if (reference) {
    return findStrictExactColumnMatch(dimensions, reference)?.id ?? null;
  }

  return null;
}

function findStrictExactColumnMatch(
  dimensions: Map<string, DimensionDescriptor>,
  reference: DimensionDescriptor,
): DimensionDescriptor | null {
  for (const [, info] of dimensions) {
    if (info.dimensionType !== reference.dimensionType) {
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
  }

  return null;
}

function findAggregateMatch(
  dimensions: Map<string, DimensionDescriptor>,
  dimensionBreakout: StoredMetricsViewerDimensionBreakout,
  config: DimensionBreakoutTypeDefinition,
  baseDefinitions?: Record<MetricSourceId, MetricDefinition | null>,
  slotIndexToSourceId?: Map<number, MetricSourceId>,
): string | null {
  const reference = findReferenceFromDimensionBreakout(
    dimensionBreakout,
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
      dimensionBreakout,
      baseDefinitions,
      slotIndexToSourceId,
    );
    if (subtypeMatch) {
      return subtypeMatch;
    }
  }

  return findDimensionOfType(dimensions, config.type)?.id ?? null;
}

export function findMatchingDimensionForBreakout(
  def: MetricDefinition,
  dimensionBreakout: StoredMetricsViewerDimensionBreakout,
  baseDefinitions?: Record<MetricSourceId, MetricDefinition | null>,
  slotIndexToSourceId?: Map<number, MetricSourceId>,
): string | null {
  const dimensions = getDimensionsByType(def);
  const config = getDimensionBreakoutConfig(dimensionBreakout.type);

  if (config?.matchMode !== "aggregate") {
    return findExactColumnMatch(
      dimensions,
      dimensionBreakout,
      baseDefinitions,
      slotIndexToSourceId,
    );
  }

  return findAggregateMatch(
    dimensions,
    dimensionBreakout,
    config,
    baseDefinitions,
    slotIndexToSourceId,
  );
}
