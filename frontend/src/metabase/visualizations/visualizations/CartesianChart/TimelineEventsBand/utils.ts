import type { EChartsType } from "echarts/core";

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
  info: "info",
  sticky_note: "sticky_note",
  event: "event",
  star: "star",
  cake: "cake",
  mail: "mail_at",
  mail_at: "mail_at",
  warning: "warning",
  bell: "bell",
  cloud: "cloud",
} satisfies Record<TimelineIcon, IconName>;

export interface PositionedTimelineEventGroup {
  group: TimelineEventGroup;
  x: number;
  iconName: IconName;
  count: number;
  isSelected: boolean;
}

export const getTimelineEventGroupIconName = (
  group: TimelineEventGroup,
): IconName => TIMELINE_ICON_TO_ICON_NAME[group.events[0]?.icon];

interface PositioningInput {
  timelineEventsModel: TimelineEventsModel;
  chartInstance: EChartsType;
  plotBounds: { left: number; right: number };
  xAxisIndex: number;
  selectedEventIds: TimelineEventId[];
}

export const getPositionedTimelineEventGroups = ({
  timelineEventsModel,
  chartInstance,
  plotBounds,
  xAxisIndex,
  selectedEventIds,
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
        isSelected: group.events.some((event) =>
          selectedEventIds.includes(event.id),
        ),
      },
    ];
  });
};
