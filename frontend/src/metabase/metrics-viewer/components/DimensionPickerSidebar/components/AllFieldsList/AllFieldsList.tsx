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
import type { AllFieldsMetricGroup } from "./types";

export function AllFieldsList({
  activeTab,
  sections,
  sourceOrder,
  sourceDataById,
  sourceColors,
  metricSlots,
  hasMultipleSources,
  expandedMetricSourceId,
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
  expandedMetricSourceId: MetricSourceId | null;
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
        expandedMetricSourceId={expandedMetricSourceId}
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

function buildAllFieldsMetricGroups({
  sections,
  sourceOrder,
  sourceDataById,
  metricSlots,
  sourceColors,
}: {
  sections: DimensionPickerSection[];
  sourceOrder: MetricSourceId[];
  sourceDataById: Record<MetricSourceId, SourceDisplayInfo>;
  metricSlots: MetricSlot[];
  sourceColors: SourceColorMap;
}): AllFieldsMetricGroup[] {
  return sourceOrder
    .map((sourceId) => {
      const metricSlot = metricSlots.find((slot) => slot.sourceId === sourceId);

      return {
        key: sourceId,
        name: sourceDataById[sourceId]?.name ?? sourceId,
        colors:
          metricSlot != null ? sourceColors[metricSlot.entityIndex] : undefined,
        sections: sections.filter(
          (section) => section.isShared || section.sourceId === sourceId,
        ),
      };
    })
    .filter((group) => group.sections.length > 0);
}
