import type {
  DimensionGroup,
  DimensionMetadata,
  MetricDefinition,
} from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

import type { DimensionType } from "./dimension-types";
import { getDimensionType } from "./dimension-types";

export interface DimensionDescriptor {
  dimensionMetadata: DimensionMetadata;
  id: string;
  name: string;
  displayName: string;
  dimensionType: DimensionType;
  group?: DimensionGroup;
  isDefault: boolean;
  canListValues: boolean;
}

const dimensionDescriptorCache = new WeakMap<
  MetricDefinition,
  Map<string, DimensionDescriptor>
>();

export function getDimensionDescriptors(
  definition: MetricDefinition,
): Map<string, DimensionDescriptor> {
  const cached = dimensionDescriptorCache.get(definition);
  if (cached) {
    return cached;
  }

  const result = new Map<string, DimensionDescriptor>();

  const defaultDimensionIds = new Set(
    LibMetric.defaultBreakoutDimensions(definition)
      .map(
        (dimension) => LibMetric.dimensionValuesInfo(definition, dimension).id,
      )
      .filter(Boolean),
  );

  for (const dimension of LibMetric.projectionableDimensions(definition)) {
    const dimensionType = getDimensionType(dimension);
    if (!dimensionType) {
      continue;
    }

    const valuesInfo = LibMetric.dimensionValuesInfo(definition, dimension);
    const displayInfo = LibMetric.displayInfo(definition, dimension);
    if (!valuesInfo.id || result.has(valuesInfo.id)) {
      continue;
    }

    result.set(valuesInfo.id, {
      dimensionMetadata: dimension,
      id: valuesInfo.id,
      name: displayInfo.name ?? displayInfo.displayName,
      displayName: displayInfo.displayName,
      dimensionType,
      group: displayInfo.group,
      isDefault: defaultDimensionIds.has(valuesInfo.id),
      canListValues: valuesInfo.canListValues,
    });
  }

  dimensionDescriptorCache.set(definition, result);
  return result;
}
