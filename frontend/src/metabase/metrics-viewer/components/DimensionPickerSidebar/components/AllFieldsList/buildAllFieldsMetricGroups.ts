import type {
  MetricSourceId,
  SourceColorMap,
} from "metabase/metrics-viewer/types";
import type {
  DimensionPickerSection,
  SourceDisplayInfo,
} from "metabase/metrics-viewer/utils";
import type { MetricSlot } from "metabase/metrics-viewer/utils/metric-slots";

import type { AllFieldsMetricGroup } from "./types";

export function buildAllFieldsMetricGroups({
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
