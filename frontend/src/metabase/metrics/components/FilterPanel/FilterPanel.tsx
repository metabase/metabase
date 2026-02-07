import { Stack } from "metabase/ui";
import type * as LibMetric from "metabase-lib/metric";

import { MetricSection } from "./MetricSection";

type FilterPanelProps = {
  definitions: LibMetric.MetricDefinition[];
  onChange: (definitions: LibMetric.MetricDefinition[]) => void;
};

export function FilterPanel({ definitions, onChange }: FilterPanelProps) {
  const handleChange = (
    definition: LibMetric.MetricDefinition,
    index: number,
  ) => {
    const newDefinitions = [...definitions];
    newDefinitions.splice(index, 1, definition);
    onChange(newDefinitions);
  };

  return (
    <Stack>
      {definitions.map((definition, definitionIndex) => (
        <MetricSection
          key={definitionIndex}
          definition={definition}
          onChange={(newDefinition) =>
            handleChange(newDefinition, definitionIndex)
          }
        />
      ))}
    </Stack>
  );
}
