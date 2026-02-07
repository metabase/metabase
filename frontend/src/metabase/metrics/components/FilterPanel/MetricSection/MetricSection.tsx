import { FixedSizeIcon, Group, type IconName, Stack } from "metabase/ui";
import * as LibMetric from "metabase-lib/metric";

import { FilterSection } from "../FilterSection";

type MetricSectionProps = {
  definition: LibMetric.MetricDefinition;
  onChange: (definition: LibMetric.MetricDefinition) => void;
};

export function MetricSection({ definition, onChange }: MetricSectionProps) {
  const filters = LibMetric.filters(definition);

  const handleRemove = (filter: LibMetric.FilterClause) => {
    onChange(LibMetric.removeClause(definition, filter));
  };

  if (filters.length === 0) {
    return null;
  }

  return (
    <Stack gap="md">
      <MetricHeader definition={definition} />
      <Stack gap="sm">
        {filters.map((filter, filterIndex) => (
          <FilterSection
            key={filterIndex}
            definition={definition}
            filter={filter}
            onRemove={() => handleRemove(filter)}
          />
        ))}
      </Stack>
    </Stack>
  );
}

type MetricHeaderProps = {
  definition: LibMetric.MetricDefinition;
};

function MetricHeader({ definition }: MetricHeaderProps) {
  const label = getMetricLabel(definition);
  const icon = getMetricIcon(definition);

  return (
    <Group>
      <FixedSizeIcon c="brand" name={icon} />
      {label}
    </Group>
  );
}

function getMetricLabel(
  definition: LibMetric.MetricDefinition,
): string | undefined {
  const metricId = LibMetric.sourceMetricId(definition);
  if (metricId != null) {
    const metric = LibMetric.metricMetadata(definition, metricId);
    const metricInfo =
      metric != null ? LibMetric.displayInfo(definition, metric) : null;
    return metricInfo?.displayName;
  }

  const measureId = LibMetric.sourceMeasureId(definition);
  if (measureId != null) {
    const measure = LibMetric.measureMetadata(definition, measureId);
    const measureInfo =
      measure != null ? LibMetric.displayInfo(definition, measure) : null;
    return measureInfo?.displayName;
  }
}

function getMetricIcon(definition: LibMetric.MetricDefinition): IconName {
  const metricId = LibMetric.sourceMetricId(definition);
  if (metricId != null) {
    return "metric";
  }
  const measureId = LibMetric.sourceMeasureId(definition);
  if (measureId != null) {
    return "ruler";
  }
  return "unknown";
}
