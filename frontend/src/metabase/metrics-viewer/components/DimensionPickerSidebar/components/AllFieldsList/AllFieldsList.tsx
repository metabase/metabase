import { t } from "ttag";

import type {
  MetricSourceId,
  MetricsViewerDimensionBreakoutState,
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

type AllFieldsListProps = {
  activeDimensionBreakout: MetricsViewerDimensionBreakoutState;
  sections: DimensionPickerSection[];
  metricSourceOrder: MetricSourceId[];
  metricSourceDataById: Record<MetricSourceId, SourceDisplayInfo>;
  sourceColors: SourceColorMap;
  metricSlots: MetricSlot[];
  onSelect: (item: DimensionPickerItem) => void;
};

export function AllFieldsList({
  activeDimensionBreakout,
  sections,
  metricSourceOrder,
  metricSourceDataById,
  sourceColors,
  metricSlots,
  onSelect,
}: AllFieldsListProps) {
  if (sections.length === 0) {
    return (
      <Text c="text-secondary" ta="center" py="lg">{t`No fields found`}</Text>
    );
  }

  const metricGroups = buildAllFieldsMetricGroups({
    sections,
    sourceOrder: metricSourceOrder,
    sourceDataById: metricSourceDataById,
    metricSlots,
    sourceColors,
  });

  if (metricSourceOrder.length > 1 && metricGroups.length > 1) {
    return (
      <MetricAccordionList
        activeDimensionBreakout={activeDimensionBreakout}
        defaultExpandedGroupKeys={metricSourceOrder.slice(0, 1)}
        groups={metricGroups}
        onSelect={onSelect}
      />
    );
  }

  return (
    <AllFieldsSectionList
      activeDimensionBreakout={activeDimensionBreakout}
      sections={sections}
      onSelect={onSelect}
    />
  );
}
