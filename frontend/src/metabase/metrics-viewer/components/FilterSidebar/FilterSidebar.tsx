import { useCallback, useState } from "react";

import { FilterPicker } from "metabase/metrics/components/FilterPicker";
import type { FlexProps } from "metabase/ui";
import { Box, Flex } from "metabase/ui";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
} from "../../types/viewer-state";

import S from "./FilterSidebar.module.css";

type FilterSidebarProps = {
  definitions: MetricsViewerDefinitionEntry[];
  onUpdateDefinition: (
    id: MetricSourceId,
    definition: MetricDefinition,
  ) => void;
} & Pick<FlexProps, "w">;

export function FilterSidebar({
  definitions,
  onUpdateDefinition,
  w,
}: FilterSidebarProps) {
  const [pickerKey, setPickerKey] = useState(0);

  const validEntries = definitions.filter(
    (
      entry,
    ): entry is MetricsViewerDefinitionEntry & {
      definition: MetricDefinition;
    } => entry.definition != null,
  );

  const validDefinitions = validEntries.map((entry) => entry.definition);

  const handleFilterSelect = useCallback(
    (
      _definition: MetricDefinition,
      definitionIndex: number,
      filter: LibMetric.FilterClause,
    ) => {
      const entry = validEntries[definitionIndex];
      const newDef = LibMetric.filter(entry.definition, filter);
      onUpdateDefinition(entry.id, newDef);
      setPickerKey((k) => k + 1);
    },
    [validEntries, onUpdateDefinition],
  );

  return (
    <Flex className={S.root} direction="column" w={w} miw={w}>
      <Box className={S.body}>
        <FilterPicker
          key={pickerKey}
          definitions={validDefinitions}
          onSelect={handleFilterSelect}
        />
      </Box>
    </Flex>
  );
}
