import { useCallback, useState } from "react";
import { t } from "ttag";

import { FilterPanel } from "metabase/metrics/components/FilterPanel";
import { FilterPicker } from "metabase/metrics/components/FilterPicker";
import type { FlexProps } from "metabase/ui";
import { Box, Flex, Icon, Text } from "metabase/ui";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

import type {
  DefinitionId,
  MetricsViewerDefinitionEntry,
} from "../../types/viewer-state";

import S from "./FilterSidebar.module.css";

type FilterSidebarProps = {
  definitions: MetricsViewerDefinitionEntry[];
  onUpdateDefinition: (id: DefinitionId, definition: MetricDefinition) => void;
  onClose: () => void;
} & Pick<FlexProps, "w">;

export function FilterSidebar({
  definitions,
  onUpdateDefinition,
  onClose,
  w,
}: FilterSidebarProps) {
  const [pickerKey, setPickerKey] = useState(0);

  const validEntries = definitions.filter(
    (entry): entry is MetricsViewerDefinitionEntry & { definition: MetricDefinition } =>
      entry.definition != null,
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

  const handleFilterRemove = useCallback(
    (
      _definition: MetricDefinition,
      definitionIndex: number,
      filter: LibMetric.FilterClause,
    ) => {
      const entry = validEntries[definitionIndex];
      const newDef = LibMetric.removeClause(entry.definition, filter);
      onUpdateDefinition(entry.id, newDef);
    },
    [validEntries, onUpdateDefinition],
  );

  return (
    <Flex className={S.root} direction="column" w={w} miw={w}>
      <Flex justify="space-between" align="center" px="md" pt="md" pb="sm" flex="0 0 auto">
        <Text fw="bold" fz="lg">{t`Filters`}</Text>
        <Icon name="close" className={S.closeIcon} onClick={onClose} />
      </Flex>
      <Box className={S.body}>
        <Box px="md">
          <FilterPanel
            definitions={validDefinitions}
            onRemove={handleFilterRemove}
          />
        </Box>
        <FilterPicker
          key={pickerKey}
          definitions={validDefinitions}
          onSelect={handleFilterSelect}
        />
      </Box>
    </Flex>
  );
}
