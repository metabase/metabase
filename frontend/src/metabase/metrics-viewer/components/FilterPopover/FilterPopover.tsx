import { useCallback, useState } from "react";

import { Box, Popover } from "metabase/ui";
import type { FilterClause, MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

import type { MetricSourceId, SourceColorMap } from "../../types/viewer-state";

import S from "./FilterPopover.module.css";
import type { DefinitionSource } from "./FilterPopoverContent";
import { FilterPopoverContent } from "./FilterPopoverContent";

const POPOVER_MAX_HEIGHT = 600;

interface FilterPopoverProps {
  definitions: DefinitionSource[];
  metricColors: SourceColorMap;
  onUpdateDefinition: (
    id: MetricSourceId,
    definition: MetricDefinition,
  ) => void;
  children: React.ReactNode;
}

export function FilterPopover({
  definitions,
  metricColors,
  onUpdateDefinition,
  children,
}: FilterPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [contentKey, setContentKey] = useState(0);

  const handleFilterApplied = useCallback(
    (sourceId: MetricSourceId, filter: FilterClause) => {
      const source = definitions.find(
        (definition) => definition.id === sourceId,
      );
      if (!source) {
        return;
      }
      const newDefinition = LibMetric.filter(source.definition, filter);
      onUpdateDefinition(sourceId, newDefinition);
      setIsOpen(false);
      setContentKey((key) => key + 1);
    },
    [definitions, onUpdateDefinition],
  );

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  return (
    <Popover position="bottom-end" opened={isOpen} onChange={setIsOpen}>
      <Popover.Target>
        <Box onClick={handleToggle} className={S.popoverTarget}>
          {children}
        </Box>
      </Popover.Target>
      <Popover.Dropdown p={0} mah={POPOVER_MAX_HEIGHT} className={S.dropdown}>
        {definitions.length > 0 && (
          <FilterPopoverContent
            key={contentKey}
            definitions={definitions}
            metricColors={metricColors}
            onFilterApplied={handleFilterApplied}
          />
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
