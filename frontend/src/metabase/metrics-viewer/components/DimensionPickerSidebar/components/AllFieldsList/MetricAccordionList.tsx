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
  expandedMetricSourceId,
  onToggleMetric,
  onSelect,
}: {
  activeTab: MetricsViewerTabState;
  groups: AllFieldsMetricGroup[];
  expandedMetricSourceId: MetricSourceId | null;
  onToggleMetric: (sourceId: MetricSourceId) => void;
  onSelect: (item: DimensionPickerItem) => void;
}) {
  const expandedGroupKey = expandedMetricSourceId ?? groups[0]?.key;

  return (
    <Stack gap="xs">
      {groups.map((group) => (
        <MetricAccordionItem
          key={group.key}
          activeTab={activeTab}
          group={group}
          isExpanded={group.key === expandedGroupKey}
          onToggle={() => onToggleMetric(group.key)}
          onSelect={onSelect}
        />
      ))}
    </Stack>
  );
}
