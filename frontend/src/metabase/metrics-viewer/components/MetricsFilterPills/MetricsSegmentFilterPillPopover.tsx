import { useCallback, useState } from "react";
import { t } from "ttag";

import {
  trackMetricsViewerFilterEdited,
  trackMetricsViewerFilterRemoved,
} from "metabase/metrics-viewer/analytics";
import { Badge, Flex, Popover, Text } from "metabase/ui";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

import type { SourceColorMap } from "../../types/viewer-state";
import type { DefinitionSource } from "../../utils/definition-sources";
import { FilterPopoverContent } from "../FilterPopover/FilterPopoverContent";

import { MetricsFilterPill } from "./MetricsFilterPill";
import S from "./MetricsSegmentFilterPillPopover.module.css";

const POPOVER_MAX_HEIGHT = "37.5rem";

interface MetricsSegmentFilterPillPopoverProps {
  definitionSource: DefinitionSource;
  oldFilter: LibMetric.FilterClause;
  colors: string[];
  metricColors: SourceColorMap;
  metricName?: string;
  metricCount?: number;
  segmentName?: string;
  onSourceDefinitionChange: (
    source: DefinitionSource,
    newDefinition: MetricDefinition,
  ) => void;
  onRemove: () => void;
}

export function MetricsSegmentFilterPillPopover({
  definitionSource,
  oldFilter,
  colors,
  metricColors,
  metricName,
  metricCount,
  segmentName,
  onSourceDefinitionChange,
  onRemove,
}: MetricsSegmentFilterPillPopoverProps) {
  const [isOpened, setIsOpened] = useState(false);
  const [contentKey, setContentKey] = useState(0);

  const handleScopedDefinitionChange = useCallback(
    (source: DefinitionSource, newDefinition: MetricDefinition) => {
      const replaced = LibMetric.removeClause(newDefinition, oldFilter);
      onSourceDefinitionChange(source, replaced);
    },
    [oldFilter, onSourceDefinitionChange],
  );

  const handleFilterApplied = useCallback(() => {
    setIsOpened(false);
    setContentKey((key) => key + 1);
    trackMetricsViewerFilterEdited("metric_filter");
  }, []);

  const handleRemove = useCallback(() => {
    onRemove();
    trackMetricsViewerFilterRemoved("metric_filter");
    setIsOpened(false);
  }, [onRemove]);

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
          fallbackIcon="segment"
          onClick={() => setIsOpened((prev) => !prev)}
          onRemoveClick={handleRemove}
          aria-label={t`Segment filter: ${segmentName ?? ""}`}
        >
          <Flex align="center" gap="xs">
            {metricName && (
              <Flex align="center">
                <Text component="span" fw={700} c="inherit" fz="inherit">
                  {metricName}
                </Text>
                {(metricCount ?? 0) > 1 && (
                  <Badge
                    circle
                    color="filter"
                    // override background from Badge.config.tsx
                    styles={{ root: { background: "var(--badge-bg)" } }}
                    ml="xs"
                  >
                    {metricCount}
                  </Badge>
                )}
                <Text component="span" fw={700} c="inherit" fz="inherit">
                  {", "}
                </Text>
              </Flex>
            )}
            <Text component="span" fw={700} c="inherit" fz="inherit">
              {segmentName}
            </Text>
          </Flex>
        </MetricsFilterPill>
      </Popover.Target>
      <Popover.Dropdown p={0} mah={POPOVER_MAX_HEIGHT} className={S.dropdown}>
        <FilterPopoverContent
          key={contentKey}
          definitionSources={[definitionSource]}
          metricColors={metricColors}
          onSourceDefinitionChange={handleScopedDefinitionChange}
          onFilterApplied={handleFilterApplied}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
