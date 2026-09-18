import type { SupportedUnit } from "types/dayjs";
import _ from "underscore";

import { type OpUnitType, dayjs } from "metabase/dayjs";
import { parseTimestamp } from "metabase/utils/time-dayjs";
import type { TimelineEvent } from "metabase-types/api";

import { CHART_STYLE } from "../constants/style";
import type { ChartLayout } from "../layout/types";
import { isTimeSeriesAxis } from "../model/guards";
import type {
  BaseCartesianChartModel,
  DateRange,
  TimeSeriesInterval,
} from "../model/types";

import type { TimelineEventCluster, TimelineEventGroup } from "./types";

const getIntervalWidth = (
  range: DateRange,
  interval: TimeSeriesInterval,
  chartLayout: ChartLayout,
) => {
  const intervalsCount = Math.abs(
    dayjs(range[1]).diff(range[0], interval.unit) / interval.count,
  );

  return chartLayout.boundaryWidth / intervalsCount;
};

const groupEventsByUnitStart = (
  events: TimelineEvent[],
  unit: SupportedUnit = "day",
): TimelineEventGroup[] => {
  const groupedEvents = events.reduce<Map<string, TimelineEvent[]>>(
    (acc, event) => {
      const unitStart = dayjs
        .utc(event.timestamp)
        // Unjustified type cast. FIXME
        .startOf(unit as OpUnitType)
        .toISOString();

      if (!acc.has(unitStart)) {
        acc.set(unitStart, [event]);
      } else {
        acc.get(unitStart)?.push(event);
      }

      return acc;
    },
    new Map(),
  );

  return Array.from(groupedEvents, ([date, events]) => ({
    date,
    events,
  }));
};

export const buildTimelineEventClusters = (
  eventGroups: TimelineEventGroup[],
  interval: TimeSeriesInterval,
  intervalWidth: number,
): TimelineEventCluster[] => {
  const sortedGroups = [...eventGroups].sort((a, b) =>
    dayjs.utc(a.date).isAfter(dayjs.utc(b.date)) ? 1 : -1,
  );

  const clusters: TimelineEventCluster[] = [];

  sortedGroups.forEach((group) => {
    const lastCluster = _.last(clusters);

    if (lastCluster != null) {
      const lastGroupDate =
        lastCluster.groups[lastCluster.groups.length - 1].date;
      const intervalsDiff =
        dayjs.utc(group.date).diff(dayjs.utc(lastGroupDate), interval.unit) /
        interval.count;
      const pixelDiff = intervalsDiff * intervalWidth;

      if (pixelDiff < CHART_STYLE.timelineEvents.minDistance) {
        clusters[clusters.length - 1] = {
          date: lastCluster.date,
          groups: [...lastCluster.groups, group],
        };
        return;
      }
    }

    clusters.push({ date: group.date, groups: [group] });
  });

  return clusters;
};

export const isTimelineEventInRange = (
  event: TimelineEvent,
  [min, max]: DateRange,
  interval: TimeSeriesInterval | null,
) => {
  const unit: SupportedUnit | undefined = interval?.unit;
  return parseTimestamp(event.timestamp).isBetween(min, max, unit, "[]");
};

const getTimelineEventsInsideRange = (
  timelineEvents: TimelineEvent[],
  range: DateRange,
  interval: TimeSeriesInterval,
) =>
  timelineEvents.filter((event) =>
    isTimelineEventInRange(event, range, interval),
  );

export const getTimelineEventsModel = (
  chartModel: BaseCartesianChartModel,
  chartLayout: ChartLayout,
  timelineEvents: TimelineEvent[],
) => {
  if (timelineEvents.length === 0 || !isTimeSeriesAxis(chartModel.xAxisModel)) {
    return null;
  }

  const dimensionRange = chartModel.xAxisModel.range;
  if (!dimensionRange) {
    return null;
  }

  const visibleTimelineEvents = getTimelineEventsInsideRange(
    timelineEvents,
    dimensionRange,
    chartModel.xAxisModel.interval,
  );

  const hasTimelineEvents = visibleTimelineEvents.length !== 0;
  if (!hasTimelineEvents) {
    return null;
  }

  const timelineEventsByUnitStart = groupEventsByUnitStart(
    visibleTimelineEvents,
    chartModel.xAxisModel.interval.unit,
  );

  const intervalWidth = getIntervalWidth(
    dimensionRange,
    chartModel.xAxisModel.interval,
    chartLayout,
  );
  return buildTimelineEventClusters(
    timelineEventsByUnitStart,
    chartModel.xAxisModel.interval,
    intervalWidth,
  );
};
