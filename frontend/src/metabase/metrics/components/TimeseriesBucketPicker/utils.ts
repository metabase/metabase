import { t } from "ttag";

import * as Lib from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";
import type { TemporalUnit } from "metabase-types/api";

import type { ProjectionInfo, TemporalUnitItem } from "./types";

export function getSharedTemporalUnits(
  projections: ProjectionInfo[],
): TemporalUnit[] {
  if (projections.length === 0) {
    return [];
  }

  const initialUnits = getDimensionTemporalUnits(projections[0]);
  return projections.reduce((availableUnits, projection) => {
    const currentUnits = new Set(getDimensionTemporalUnits(projection));
    return availableUnits.filter((unit) => currentUnits.has(unit));
  }, initialUnits);
}

function getDimensionTemporalUnits({
  definition,
  dimension,
}: ProjectionInfo): TemporalUnit[] {
  return LibMetric.availableTemporalBuckets(definition, dimension).map(
    (bucket) => {
      const bucketInfo = LibMetric.displayInfo(definition, bucket);
      return bucketInfo.shortName;
    },
  );
}

export function getSharedTemporalUnitItems(
  units: TemporalUnit[],
): TemporalUnitItem[] {
  return units.map((unit) => ({
    value: unit,
    label: getTemporalUnitLabel(unit),
  }));
}

export function getTemporalUnitLabel(unit: TemporalUnit | undefined): string {
  return unit ? Lib.describeTemporalUnit(unit) : t`Unbinned`;
}
