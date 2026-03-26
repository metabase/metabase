import type { DimensionDescriptor } from "metabase/metrics/common/utils/dimension-descriptors";
import { getDimensionDescriptors } from "metabase/metrics/common/utils/dimension-descriptors";
import type {
  DimensionType,
  GeoSubtype,
} from "metabase/metrics/common/utils/dimension-types";
import {
  GEO_SUBTYPE_PRIORITY,
  getGeoSubtype,
} from "metabase/metrics/common/utils/dimension-types";
import type { MetricDefinition } from "metabase-lib/metric";

export interface DefaultDimension {
  dimensionId: string;
  dimensionType: DimensionType;
  label: string;
}

export function getDefaultDimensions(
  definition: MetricDefinition,
): DefaultDimension[] {
  const descriptors = getDimensionDescriptors(definition);
  if (descriptors.size === 0) {
    return [];
  }

  return [
    ...pickAggregate(descriptors, "time"),
    ...pickAggregate(descriptors, "geo"),
    ...pickAllOfType(descriptors, "category", { requireListValues: true }),
    ...pickAllOfType(descriptors, "boolean"),
  ];
}

function toDefaultDimension(descriptor: DimensionDescriptor): DefaultDimension {
  return {
    dimensionId: descriptor.id,
    dimensionType: descriptor.dimensionType,
    label: descriptor.displayName,
  };
}

function pickAggregate(
  descriptors: Map<string, DimensionDescriptor>,
  dimensionType: DimensionType,
): DefaultDimension[] {
  const best =
    dimensionType === "geo"
      ? findBestGeoDimension(descriptors)
      : findBestDimension(descriptors, dimensionType);

  return best ? [toDefaultDimension(best)] : [];
}

function pickAllOfType(
  descriptors: Map<string, DimensionDescriptor>,
  dimensionType: DimensionType,
  options?: { requireListValues?: boolean },
): DefaultDimension[] {
  return [...descriptors.values()]
    .filter(
      (dimension) =>
        dimension.dimensionType === dimensionType &&
        (!options?.requireListValues || dimension.canListValues),
    )
    .sort((first, second) => {
      if (first.canListValues !== second.canListValues) {
        return first.canListValues ? -1 : 1;
      }
      return first.displayName.localeCompare(second.displayName);
    })
    .map(toDefaultDimension);
}

function findBestDimension(
  descriptors: Map<string, DimensionDescriptor>,
  dimensionType: DimensionType,
): DimensionDescriptor | null {
  const matching = [...descriptors.values()].filter(
    (dimension) => dimension.dimensionType === dimensionType,
  );

  return (
    matching.find((dimension) => dimension.isDefault) ?? matching[0] ?? null
  );
}

function findBestGeoDimension(
  descriptors: Map<string, DimensionDescriptor>,
): DimensionDescriptor | null {
  const geoDimensions = [...descriptors.values()].filter(
    (dimension) => dimension.dimensionType === "geo",
  );

  const subtypeMap = new Map(
    geoDimensions
      .map(
        (dimension) =>
          [getGeoSubtype(dimension.dimensionMetadata), dimension] as const,
      )
      .filter(
        (entry): entry is readonly [GeoSubtype, DimensionDescriptor] =>
          entry[0] != null,
      ),
  );

  const prioritized = GEO_SUBTYPE_PRIORITY.find((subtype) =>
    subtypeMap.has(subtype),
  );

  return prioritized
    ? (subtypeMap.get(prioritized) ?? null)
    : (geoDimensions[0] ?? null);
}
