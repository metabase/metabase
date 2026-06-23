import type { EChartsType } from "echarts/core";

import type { ChartBoundsCoords } from "metabase/visualizations/echarts/cartesian/layout/types";
import type {
  TimelineEventGroup,
  TimelineEventsModel,
} from "metabase/visualizations/echarts/cartesian/timeline-events/types";
import type {
  IconName,
  TimelineEventId,
  TimelineIcon,
} from "metabase-types/api";

export const TIMELINE_ICON_TO_ICON_NAME = {
  star: "star",
  cake: "cake",
  mail: "mail",
  warning: "warning",
  bell: "bell",
  cloud: "cloud",
} satisfies Record<TimelineIcon, IconName>;

export interface PositionedTimelineEventGroup {
  group: TimelineEventGroup;
  x: number;
  isSelected: boolean;
  iconName: IconName;
  count: number;
}

export const isTimelineEventGroupSelected = (
  group: TimelineEventGroup,
  selectedTimelineEventIds: TimelineEventId[],
): boolean =>
  group.events.some((event) => selectedTimelineEventIds.includes(event.id));

export const getTimelineEventGroupIconName = (
  group: TimelineEventGroup,
): IconName =>
  group.events.length > 1
    ? "star"
    : TIMELINE_ICON_TO_ICON_NAME[group.events[0].icon];

interface PositioningInput {
  timelineEventsModel: TimelineEventsModel;
  chartInstance: EChartsType;
  bounds: ChartBoundsCoords;
  xAxisIndex: number;
  selectedTimelineEventIds: TimelineEventId[];
}

/**
 * Maps each (already clustered) timeline event group to a pixel x within the
 * chart's plotting area using the live ECharts coordinate system, dropping
 * groups that fall outside the visible x range.
 */
export const getPositionedTimelineEventGroups = ({
  timelineEventsModel,
  chartInstance,
  bounds,
  xAxisIndex,
  selectedTimelineEventIds,
}: PositioningInput): PositionedTimelineEventGroup[] => {
  const { left, right } = bounds;

  return timelineEventsModel.flatMap((group) => {
    const pixel = chartInstance.convertToPixel({ xAxisIndex }, group.date);
    const x = Array.isArray(pixel) ? pixel[0] : pixel;

    if (!Number.isFinite(x) || x < left || x > right) {
      return [];
    }

    return [
      {
        group,
        x,
        isSelected: isTimelineEventGroupSelected(
          group,
          selectedTimelineEventIds,
        ),
        iconName: getTimelineEventGroupIconName(group),
        count: group.events.length,
      },
    ];
  });
};
