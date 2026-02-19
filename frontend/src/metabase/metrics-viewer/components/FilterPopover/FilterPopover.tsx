import { useCallback, useMemo, useState } from "react";

import { Box, Popover } from "metabase/ui";
import type { FilterClause, MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  SourceColorMap,
} from "../../types/viewer-state";

import S from "./FilterPopover.module.css";
import { FilterPopoverContent } from "./FilterPopoverContent";
import type { ValidDefinitionEntry } from "./types";

const POPOVER_MAX_HEIGHT = 600;

interface FilterPopoverProps {
  definitions: MetricsViewerDefinitionEntry[];
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
  const [contentKey, setContentKey] = useState(0);

  const validEntries = useMemo(
    () =>
      definitions.filter(
        (entry): entry is ValidDefinitionEntry => entry.definition != null,
      ),
    [definitions],
  );

  const handleFilterApplied = useCallback(
    (entryId: MetricSourceId, filter: FilterClause) => {
      const entry = validEntries.find((entry) => entry.id === entryId);
      if (!entry) {
        return;
      }
      const newDefinition = LibMetric.filter(entry.definition, filter);
      onUpdateDefinition(entryId, newDefinition);
      setContentKey((key) => key + 1);
    },
    [validEntries, onUpdateDefinition],
  );

  return (
    <Popover position="bottom-start">
      <Popover.Target>{children}</Popover.Target>
      <Popover.Dropdown p={0}>
        {validEntries.length > 0 && (
          <Box mah={POPOVER_MAX_HEIGHT} className={S.dropdownContent}>
            <FilterPopoverContent
              key={contentKey}
              validEntries={validEntries}
              metricColors={metricColors}
              onFilterApplied={handleFilterApplied}
            />
          </Box>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
