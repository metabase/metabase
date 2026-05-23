import { t } from "ttag";

import type {
  MetricSourceId,
  MetricsViewerTabState,
  SourceColorMap,
} from "metabase/metrics-viewer/types";
import type {
  DimensionPickerItem,
  DimensionPickerSection,
  SourceDisplayInfo,
} from "metabase/metrics-viewer/utils";
import type { MetricSlot } from "metabase/metrics-viewer/utils/metric-slots";
import { Text } from "metabase/ui";

import { AllFieldsSectionList } from "./AllFieldsSectionList";
import { MetricAccordionList } from "./MetricAccordionList";
import { buildAllFieldsMetricGroups } from "./buildAllFieldsMetricGroups";

export function AllFieldsList({
  activeTab,
  sections,
  sourceOrder,
  sourceDataById,
  sourceColors,
  metricSlots,
  hasMultipleSources,
  expandedMetricSourceIds,
  onToggleMetric,
  onSelect,
}: {
  activeTab: MetricsViewerTabState;
  sections: DimensionPickerSection[];
  sourceOrder: MetricSourceId[];
  sourceDataById: Record<MetricSourceId, SourceDisplayInfo>;
  sourceColors: SourceColorMap;
  metricSlots: MetricSlot[];
  hasMultipleSources: boolean;
  expandedMetricSourceIds: MetricSourceId[];
  onToggleMetric: (sourceId: MetricSourceId) => void;
  onSelect: (item: DimensionPickerItem) => void;
}) {
  if (sections.length === 0) {
    return (
      <Text c="text-secondary" ta="center" py="lg">{t`No fields found`}</Text>
    );
  }

  const metricGroups = buildAllFieldsMetricGroups({
    sections,
    sourceOrder,
    sourceDataById,
    metricSlots,
    sourceColors,
  });

  if (hasMultipleSources && metricGroups.length > 1) {
    return (
      <MetricAccordionList
        activeTab={activeTab}
        groups={metricGroups}
        expandedMetricSourceIds={expandedMetricSourceIds}
        onToggleMetric={onToggleMetric}
        onSelect={onSelect}
      />
    );
  }

  return (
    <AllFieldsSectionList
      activeTab={activeTab}
      sections={sections}
      onSelect={onSelect}
    />
  );
}
