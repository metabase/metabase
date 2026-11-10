import { useMemo } from "react";
import { t } from "ttag";

import { getTemporalUnits } from "metabase/common/metrics/utils/dates";
import { getDimensionDescriptors } from "metabase/common/metrics/utils/dimension-descriptors";
import { useMetricDefinition } from "metabase/metrics/common/hooks";
import { Select } from "metabase/ui";
import * as Lib from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";
import type {
  MetricDimension,
  MetricId,
  TemporalUnit,
} from "metabase-types/api";

const NO_UNITS: TemporalUnit[] = [];

/** The time groupings a saved metric's date dimension offers; none otherwise */
export function useMetricDimensionTemporalUnits(
  metricId: MetricId,
  dimension: MetricDimension,
): TemporalUnit[] {
  const { definition } = useMetricDefinition(metricId);
  return useMemo(() => {
    const dimensionMetadata = definition
      ? getDimensionDescriptors(definition).get(dimension.id)?.dimensionMetadata
      : undefined;
    return definition &&
      dimensionMetadata &&
      LibMetric.isDateOrDateTime(dimensionMetadata)
      ? getTemporalUnits(definition, dimensionMetadata)
      : NO_UNITS;
  }, [definition, dimension.id]);
}

interface DimensionTimeGroupingSelectProps {
  /** Empty for dimensions that aren't dates; the select then hides */
  temporalUnits: TemporalUnit[];
  value: TemporalUnit | undefined;
  onChange: (unit: TemporalUnit) => void;
}

export function DimensionTimeGroupingSelect({
  temporalUnits,
  value,
  onChange,
}: DimensionTimeGroupingSelectProps) {
  const options = useMemo(
    () =>
      temporalUnits.map((unit) => ({
        value: unit,
        label: Lib.describeTemporalUnit(unit),
      })),
    [temporalUnits],
  );

  const handleChange = (newValue: string | null) => {
    if (newValue && isTemporalUnit(newValue, temporalUnits)) {
      onChange(newValue);
    }
  };

  if (temporalUnits.length === 0) {
    return null;
  }

  return (
    <Select
      aria-label={t`Time grouping`}
      data={options}
      value={value ?? null}
      placeholder={t`Select a time grouping`}
      allowDeselect={false}
      w="12rem"
      onChange={handleChange}
    />
  );
}

function isTemporalUnit(
  value: string,
  temporalUnits: TemporalUnit[],
): value is TemporalUnit {
  return temporalUnits.some((unit) => unit === value);
}
