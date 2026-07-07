import type { EChartsType } from "echarts/core";

import type {
  TimelineEventGroup,
  TimelineEventsModel,
} from "metabase/visualizations/echarts/cartesian/timeline-events/types";
import type { IconName, TimelineIcon } from "metabase-types/api";

export const TIMELINE_ICON_TO_SMALL_ICON_MAP = {
  info: "info",
  note: "note_12",
  event: "event",
  star: "star",
  cake: "cake",
  mail: "mail_at",
  mail_at: "mail_at",
  warning: "warning",
  bell: "bell_12",
  cloud: "cloud_12",
} satisfies Record<TimelineIcon, IconName>;

export interface PositionedTimelineEventGroup {
  group: TimelineEventGroup;
  x: number;
}

export const getTimelineEventGroupIconName = (
  group: TimelineEventGroup,
): IconName => {
  const icon = group.events.at(0)?.icon;
  return icon != null ? TIMELINE_ICON_TO_SMALL_ICON_MAP[icon] : "star";
};

interface PositioningInput {
  timelineEventsModel: TimelineEventsModel;
  chartInstance: EChartsType;
  plotBounds: { left: number; right: number };
  xAxisIndex: number;
}

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

    return [{ group, x }];
  });
};

export const arePositionedGroupsEqual = (
  a: PositionedTimelineEventGroup[],
  b: PositionedTimelineEventGroup[],
): boolean =>
  a.length === b.length &&
  a.every((item, index) => {
    const other = b[index];
    return item.group === other.group && item.x === other.x;
  });
