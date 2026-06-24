import type { EChartsType } from "echarts/core";

import type {
  TimelineEventGroup,
  TimelineEventsModel,
} from "metabase/visualizations/echarts/cartesian/timeline-events/types";
import type { IconName, TimelineIcon } from "metabase-types/api";

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
  iconName: IconName;
  count: number;
}

export const getTimelineEventGroupIconName = (
  group: TimelineEventGroup,
): IconName =>
  group.events.length > 1
    ? "star"
    : TIMELINE_ICON_TO_ICON_NAME[group.events[0].icon];

interface PositioningInput {
  timelineEventsModel: TimelineEventsModel;
  chartInstance: EChartsType;
  /** Horizontal pixel extent of the plot area (ECharts grid). */
  plotBounds: { left: number; right: number };
  xAxisIndex: number;
}

/**
 * Maps each (already clustered) timeline event group to a pixel x within the
 * chart's plotting area using the live ECharts coordinate system, dropping
 * groups that fall outside the visible x range.
 */
export const getPositionedTimelineEventGroups = ({
  timelineEventsModel,
  chartInstance,
  plotBounds,
  xAxisIndex,
}: PositioningInput): PositionedTimelineEventGroup[] => {
  const { left, right } = plotBounds;

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
        iconName: getTimelineEventGroupIconName(group),
        count: group.events.length,
      },
    ];
  });
};
