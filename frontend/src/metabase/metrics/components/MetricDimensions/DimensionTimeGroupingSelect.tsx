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

interface DimensionTimeGroupingSelectProps {
  metricId: MetricId;
  dimension: MetricDimension;
  value: TemporalUnit | undefined;
  onChange: (unit: TemporalUnit) => void;
}

export function DimensionTimeGroupingSelect({
  metricId,
  dimension,
  value,
  onChange,
}: DimensionTimeGroupingSelectProps) {
  const { definition } = useMetricDefinition(metricId);
  const dimensionMetadata = useMemo(
    () =>
      definition
        ? getDimensionDescriptors(definition).get(dimension.id)
            ?.dimensionMetadata
        : undefined,
    [definition, dimension.id],
  );
  const temporalUnits = useMemo(
    () =>
      definition &&
      dimensionMetadata &&
      LibMetric.isDateOrDateTime(dimensionMetadata)
        ? getTemporalUnits(definition, dimensionMetadata)
        : [],
    [definition, dimensionMetadata],
  );

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

  if (!dimensionMetadata || !LibMetric.isDateOrDateTime(dimensionMetadata)) {
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
