import { useCallback, useState } from "react";

import { Box, Popover } from "metabase/ui";
import type { MetricDefinition } from "metabase-lib/metric";

import { trackMetricsViewerFilterAdded } from "../../analytics";
import type { SourceColorMap } from "../../types/viewer-state";
import type { DefinitionSource } from "../../utils/definition-sources";

import S from "./FilterPopover.module.css";
import { FilterPopoverContent } from "./FilterPopoverContent";

const POPOVER_MAX_HEIGHT = "37.5rem";

interface FilterPopoverProps {
  definitionSources: DefinitionSource[];
  metricColors: SourceColorMap;
  onSourceDefinitionChange: (
    source: DefinitionSource,
    newDefinition: MetricDefinition,
  ) => void;
  children: React.ReactNode;
}

export function FilterPopover({
  definitionSources,
  metricColors,
  onSourceDefinitionChange,
  children,
}: FilterPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [contentKey, setContentKey] = useState(0);

  const handleFilterApplied = useCallback(() => {
    setIsOpen(false);
    setContentKey((key) => key + 1);
    trackMetricsViewerFilterAdded("metric_filter");
  }, []);

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
        {definitionSources.length > 0 && (
          <FilterPopoverContent
            key={contentKey}
            definitionSources={definitionSources}
            metricColors={metricColors}
            onSourceDefinitionChange={onSourceDefinitionChange}
            onFilterApplied={handleFilterApplied}
          />
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
