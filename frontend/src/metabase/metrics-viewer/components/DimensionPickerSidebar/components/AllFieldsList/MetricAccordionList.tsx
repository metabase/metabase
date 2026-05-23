import type {
  MetricSourceId,
  MetricsViewerTabState,
} from "metabase/metrics-viewer/types";
import type { DimensionPickerItem } from "metabase/metrics-viewer/utils";
import { Stack } from "metabase/ui";

import { MetricAccordionItem } from "./MetricAccordionItem";
import type { AllFieldsMetricGroup } from "./types";

export function MetricAccordionList({
  activeTab,
  groups,
  expandedMetricSourceIds,
  onToggleMetric,
  onSelect,
}: {
  activeTab: MetricsViewerTabState;
  groups: AllFieldsMetricGroup[];
  expandedMetricSourceIds: MetricSourceId[];
  onToggleMetric: (sourceId: MetricSourceId) => void;
  onSelect: (item: DimensionPickerItem) => void;
}) {
  return (
    <Stack gap="xs">
      {groups.map((group) => (
        <MetricAccordionItem
          key={group.key}
          activeTab={activeTab}
          group={group}
          isExpanded={expandedMetricSourceIds.includes(group.key)}
          onToggle={() => onToggleMetric(group.key)}
          onSelect={onSelect}
        />
      ))}
    </Stack>
  );
}
