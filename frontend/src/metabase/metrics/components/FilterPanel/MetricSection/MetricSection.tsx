import { useMemo } from "react";

import { FixedSizeIcon, Group, Stack } from "metabase/ui";
import * as LibMetric from "metabase-lib/metric";

import { FilterSection } from "../FilterSection";

import { getMetricIcon, getMetricLabel } from "./utils";

type MetricSectionProps = {
  definition: LibMetric.MetricDefinition;
  onRemove: (filter: LibMetric.FilterClause) => void;
};

export function MetricSection({ definition, onRemove }: MetricSectionProps) {
  const filters = useMemo(() => LibMetric.filters(definition), [definition]);

  const label = useMemo(() => getMetricLabel(definition), [definition]);
  const icon = useMemo(() => getMetricIcon(definition), [definition]);

  if (filters.length === 0) {
    return null;
  }

  return (
    <Stack gap="md">
      <Group>
        <FixedSizeIcon c="brand" name={icon} />
        {label}
      </Group>
      <Stack gap="sm">
        {filters.map((filter, filterIndex) => (
          <FilterSection
            key={filterIndex}
            definition={definition}
            filter={filter}
            onRemove={() => onRemove(filter)}
          />
        ))}
      </Stack>
    </Stack>
  );
}
