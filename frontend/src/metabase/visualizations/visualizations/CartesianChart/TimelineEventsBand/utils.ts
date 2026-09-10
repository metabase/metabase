import type {
  EChartsType,
  TimelineEventCluster,
  TimelineEventGroup,
  TimelineEventsModel,
} from "metabase/viz-core";
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

export interface PositionedTimelineEventCluster {
  cluster: TimelineEventCluster;
  memberXs: number[];
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

const toPixelX = (
  chartInstance: EChartsType,
  xAxisIndex: number,
  date: string,
): number => {
  const pixel = chartInstance.convertToPixel({ xAxisIndex }, date);
  return Array.isArray(pixel) ? pixel[0] : pixel;
};

export const getPositionedTimelineEventClusters = ({
  timelineEventsModel,
  chartInstance,
  plotBounds,
  xAxisIndex,
}: PositioningInput): PositionedTimelineEventCluster[] => {
  const { left, right } = plotBounds;

  return timelineEventsModel.flatMap((cluster) => {
    const anchorX = toPixelX(chartInstance, xAxisIndex, cluster.date);

    if (!Number.isFinite(anchorX) || anchorX < left || anchorX > right) {
      return [];
    }

    const memberXs = cluster.groups.map((group) => {
      const memberX = toPixelX(chartInstance, xAxisIndex, group.date);
      return Number.isFinite(memberX)
        ? Math.min(Math.max(memberX, left), right)
        : anchorX;
    });

    return [{ cluster, memberXs }];
  });
};

export const arePositionedClustersEqual = (
  a: PositionedTimelineEventCluster[],
  b: PositionedTimelineEventCluster[],
): boolean =>
  a.length === b.length &&
  a.every((item, index) => {
    const other = b[index];
    return (
      item.cluster === other.cluster &&
      item.memberXs.length === other.memberXs.length &&
      item.memberXs.every((x, memberIndex) => x === other.memberXs[memberIndex])
    );
  });
