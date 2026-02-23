import { useState } from "react";

import { FilterPickerBody } from "metabase/metrics/components/FilterPicker/FilterPickerBody";
import type { IconName } from "metabase/ui";
import { Popover, Text } from "metabase/ui";
import * as LibMetric from "metabase-lib/metric";

import { MetricsFilterPill } from "./MetricsFilterPill";
import { getFilterDisplayParts } from "./utils";

interface MetricsFilterPillPopoverProps {
  definition: LibMetric.MetricDefinition;
  filter: LibMetric.FilterClause;
  colors: string[];
  icon: IconName;
  onUpdate: (newFilter: LibMetric.FilterClause) => void;
  onRemove: () => void;
}

export function MetricsFilterPillPopover({
  definition,
  filter,
  colors,
  icon,
  onUpdate,
  onRemove,
}: MetricsFilterPillPopoverProps) {
  const [isOpened, setIsOpened] = useState(false);

  const displayParts = getFilterDisplayParts(definition, filter);

  const filterParts = LibMetric.filterParts(definition, filter);
  const dimension = filterParts?.dimension ?? null;

  const handleSelect = (newFilter: LibMetric.FilterClause) => {
    onUpdate(newFilter);
    setIsOpened(false);
  };

  const handleRemove = () => {
    onRemove();
    setIsOpened(false);
  };

  return (
    <Popover
      opened={isOpened}
      position="bottom-start"
      transitionProps={{ duration: 0 }}
      onChange={setIsOpened}
    >
      <Popover.Target>
        <MetricsFilterPill
          colors={colors}
          fallbackIcon={icon}
          onClick={() => setIsOpened((prev) => !prev)}
          onRemoveClick={handleRemove}
        >
          {displayParts.label}
          {displayParts.value && (
            <Text component="span" fw={700} c="saturated-purple" fz="sm">
              {" "}
              {displayParts.value}
            </Text>
          )}
        </MetricsFilterPill>
      </Popover.Target>
      <Popover.Dropdown>
        {dimension && (
          <FilterPickerBody
            definition={definition}
            dimension={dimension}
            filter={filter}
            onSelect={handleSelect}
          />
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
