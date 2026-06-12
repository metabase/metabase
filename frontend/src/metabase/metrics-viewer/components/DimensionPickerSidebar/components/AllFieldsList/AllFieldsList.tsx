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
  metricSourceDataById: Record<MetricSourceId, SourceDisplayInfo>;
  sourceColors: SourceColorMap;
  metricSlots: MetricSlot[];
  expandAllMetricGroups: boolean;
  onSelect: (item: DimensionPickerItem) => void;
};

export function AllFieldsList({
  activeDimensionBreakout,
  sections,
  metricSourceDataById,
  sourceColors,
  metricSlots,
  expandAllMetricGroups,
  onSelect,
}: AllFieldsListProps) {
  if (sections.length === 0) {
    return (
      <Text c="text-secondary" ta="center" py="lg">{t`No fields found`}</Text>
    );
  }

  const metricGroups = buildAllFieldsMetricGroups({
    sections,
    sourceDataById: metricSourceDataById,
    metricSlots,
    sourceColors,
  });

  if (metricSlots.length > 1 && metricGroups.length > 1) {
    const defaultExpandedGroupKeys = expandAllMetricGroups
      ? metricGroups.map((group) => group.key)
      : metricGroups.slice(0, 1).map((group) => group.key);

    return (
      <MetricAccordionList
        key={defaultExpandedGroupKeys.join("|")}
        activeDimensionBreakout={activeDimensionBreakout}
        defaultExpandedGroupKeys={defaultExpandedGroupKeys}
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
