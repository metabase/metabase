import { Stack } from "metabase/ui";
import type * as LibMetric from "metabase-lib/metric";

import { MetricSection } from "./MetricSection";

type FilterPanelProps = {
  definitions: LibMetric.MetricDefinition[];
  onRemove: (
    definition: LibMetric.MetricDefinition,
    filter: LibMetric.FilterClause,
  ) => void;
};

export function FilterPanel({ definitions, onRemove }: FilterPanelProps) {
  return (
    <Stack>
      {definitions.map((definition, definitionIndex) => (
        <MetricSection
          key={definitionIndex}
          definition={definition}
          onRemove={(filter) => onRemove(definition, filter)}
        />
      ))}
    </Stack>
  );
}
