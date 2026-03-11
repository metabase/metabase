import { t } from "ttag";

import * as LibMetric from "metabase-lib/metric";

export function getStaticPlaceholder(dimension: LibMetric.DimensionMetadata) {
  const isID =
    LibMetric.isPrimaryKey(dimension) || LibMetric.isForeignKey(dimension);
  const isNumeric = LibMetric.isNumeric(dimension);

  if (isID) {
    return t`Enter an ID`;
  } else if (isNumeric) {
    return t`Enter a number`;
  } else {
    return t`Enter some text`;
  }
}

export function getSearchPlaceholder(
  dimension: LibMetric.DimensionMetadata,
  searchColumnName: string,
) {
  const isID =
    LibMetric.isPrimaryKey(dimension) || LibMetric.isForeignKey(dimension);

  if (isID) {
    return t`Search by ${searchColumnName} or enter an ID`;
  } else {
    return t`Search by ${searchColumnName}`;
  }
}

export function getNothingFoundMessage(searchColumnName: string) {
  return t`No matching ${searchColumnName} found.`;
}

export function canListAllFilterDimensions(
  definition: LibMetric.MetricDefinition,
  dimension: LibMetric.DimensionMetadata,
  allFilterDimensions: LibMetric.DimensionMetadata[] | undefined,
): boolean {
  const ownInfo = LibMetric.dimensionValuesInfo(definition, dimension);
  if (!ownInfo.canListValues) {
    return false;
  }
  if (!allFilterDimensions || allFilterDimensions.length <= 1) {
    return true;
  }
  const first = allFilterDimensions[0];
  return allFilterDimensions.every((other) =>
    LibMetric.isSameSource(first, other),
  );
}
