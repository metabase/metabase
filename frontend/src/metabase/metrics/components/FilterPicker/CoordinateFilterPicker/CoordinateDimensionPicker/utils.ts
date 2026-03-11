import { t } from "ttag";

import * as LibMetric from "metabase-lib/metric";

import type { DimensionOption } from "./types";

export function getDimensionOptions(
  definition: LibMetric.MetricDefinition,
  dimensions: LibMetric.DimensionMetadata[],
): DimensionOption[] {
  return dimensions.map((dimension, dimensionIndex) => {
    const dimensionInfo = LibMetric.displayInfo(definition, dimension);
    return {
      dimension,
      value: String(dimensionIndex),
      label: dimensionInfo.displayName,
    };
  });
}

export function getInitialOption(
  definition: LibMetric.MetricDefinition,
  options: DimensionOption[],
  secondDimension?: LibMetric.DimensionMetadata,
) {
  if (!secondDimension) {
    return undefined;
  }

  const dimensionInfo = LibMetric.displayInfo(definition, secondDimension);
  return options.find((option) => option.label === dimensionInfo?.displayName);
}

export function getDimensionPlaceholder(
  dimension: LibMetric.DimensionMetadata,
) {
  return LibMetric.isLatitude(dimension)
    ? t`Select longitude column`
    : t`Select latitude column`;
}
