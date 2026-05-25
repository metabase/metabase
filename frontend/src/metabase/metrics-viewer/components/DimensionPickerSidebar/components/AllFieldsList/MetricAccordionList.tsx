import { useState } from "react";

import type {
  MetricSourceId,
  MetricsViewerTabState,
} from "metabase/metrics-viewer/types";
import type { DimensionPickerItem } from "metabase/metrics-viewer/utils";
import { Stack } from "metabase/ui";

import { MetricAccordionItem } from "./MetricAccordionItem";
import type { AllFieldsMetricGroup } from "./types";

type MetricAccordionListProps = {
  activeTab: MetricsViewerTabState;
  defaultExpandedGroupKeys: MetricSourceId[];
  groups: AllFieldsMetricGroup[];
  onSelect: (item: DimensionPickerItem) => void;
};

export function MetricAccordionList({
  activeTab,
  defaultExpandedGroupKeys,
  groups,
  onSelect,
}: MetricAccordionListProps) {
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<MetricSourceId[]>(
    defaultExpandedGroupKeys,
  );

  const handleToggleAccordion = (sourceId: MetricSourceId) => {
    setExpandedGroupKeys((currentSourceIds) => {
      if (currentSourceIds.includes(sourceId)) {
        return currentSourceIds.filter(
          (currentSourceId) => currentSourceId !== sourceId,
        );
      }

      return [...currentSourceIds, sourceId];
    });
  };

  return (
    <Stack gap="xs">
      {groups.map((group) => (
        <MetricAccordionItem
          key={group.key}
          activeTab={activeTab}
          group={group}
          isExpanded={expandedGroupKeys.includes(group.key)}
          onToggle={() => handleToggleAccordion(group.key)}
          onSelect={onSelect}
        />
      ))}
    </Stack>
  );
}
