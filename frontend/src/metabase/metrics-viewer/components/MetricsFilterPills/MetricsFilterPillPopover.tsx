import { useState } from "react";

import { FilterPickerBody } from "metabase/metrics/components/FilterPicker/FilterPickerBody";
import {
  trackMetricsViewerFilterEdited,
  trackMetricsViewerFilterRemoved,
} from "metabase/metrics-viewer/analytics";
import type { IconName } from "metabase/ui";
import { Badge, Flex, Popover, Text } from "metabase/ui";
import * as LibMetric from "metabase-lib/metric";

import { MetricsFilterPill } from "./MetricsFilterPill";
import { getFilterDisplayParts } from "./utils";

interface MetricsFilterPillPopoverProps {
  definition: LibMetric.MetricDefinition;
  filter: LibMetric.FilterClause;
  colors: string[];
  icon?: IconName;
  metricName?: string;
  metricCount?: number;
  onUpdate: (newFilter: LibMetric.FilterClause) => void;
  onRemove: () => void;
}

export function MetricsFilterPillPopover({
  definition,
  filter,
  colors,
  icon,
  metricName,
  metricCount,
  onUpdate,
  onRemove,
}: MetricsFilterPillPopoverProps) {
  const [isOpened, setIsOpened] = useState(false);

  const displayParts = getFilterDisplayParts(definition, filter);

  const filterParts = LibMetric.filterParts(definition, filter);
  const dimension = filterParts?.dimension ?? null;

  const handleSelect = (newFilter: LibMetric.FilterClause) => {
    onUpdate(newFilter);
    trackMetricsViewerFilterEdited("metric_filter");
    setIsOpened(false);
  };

  const handleRemove = () => {
    onRemove();
    trackMetricsViewerFilterRemoved("metric_filter");
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
          <Flex align="center" gap="xs">
            {metricName && (
              <Text component="span" fw={700} c="inherit" fz="inherit">
                {metricName}
              </Text>
            )}
            {metricName && (metricCount ?? 0) > 1 && (
              <Badge
                circle
                color="filter"
                // override background from Badge.config.tsx
                styles={{ root: { background: "var(--badge-bg)" } }}
              >
                {metricCount}
              </Badge>
            )}
            {displayParts.label}
            {displayParts.value && (
              <Text component="span" fw={700} c="inherit" fz="inherit">
                {" "}
                {displayParts.value}
              </Text>
            )}
          </Flex>
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
