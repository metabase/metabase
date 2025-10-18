import type { OpUnitType } from "dayjs";
import dayjs from "dayjs";
import type { SupportedUnit } from "types/dayjs";
import _ from "underscore";

import { CHART_STYLE } from "metabase/visualizations/echarts/cartesian/constants/style";
import type {
  BaseCartesianChartModel,
  DateRange,
  TimeSeriesInterval,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type { TimelineEventGroup } from "metabase/visualizations/echarts/cartesian/timeline-events/types";
import type { RenderingContext } from "metabase/visualizations/types";
import type { TimelineEvent } from "metabase-types/api";

import type { ChartMeasurements } from "../chart-measurements/types";
import { isTimeSeriesAxis } from "../model/guards";

const getIntervalWidth = (
  range: DateRange,
  interval: TimeSeriesInterval,
  chartMeasurements: ChartMeasurements,
) => {
  const intervalsCount = Math.abs(
    dayjs(range[1]).diff(range[0], interval.unit) / interval.count,
  );

  return chartMeasurements.boundaryWidth / intervalsCount;
};

const groupEventsByUnitStart = (
  events: TimelineEvent[],
  unit: SupportedUnit = "day",
): TimelineEventGroup[] => {
  const groupedEvents = events.reduce<Map<string, TimelineEvent[]>>(
    (acc, event) => {
      const unitStart = dayjs
        .utc(event.timestamp)
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

const getMinDistanceFromTimelineEventGroup = (
  eventGroup: TimelineEventGroup,
  renderingContext: RenderingContext,
) => {
  const eventsCount = eventGroup.events.length;
  if (eventsCount === 1) {
    return CHART_STYLE.timelineEvents.minDistance;
  }

  const countLabelWidth = renderingContext.measureText(eventsCount.toString(), {
    ...CHART_STYLE.axisTicks,
    size: renderingContext.theme.cartesian.label.fontSize,
    family: renderingContext.fontFamily,
  });

  return (
    CHART_STYLE.timelineEvents.minDistance +
    CHART_STYLE.timelineEvents.countLabelMargin +
    countLabelWidth
  );
};

export const mergeOverlappingTimelineEventGroups = (
  eventGroups: TimelineEventGroup[],
  interval: TimeSeriesInterval,
  intervalWidth: number,
  renderingContext: RenderingContext,
): TimelineEventGroup[] => {
  const sortedGroups = [...eventGroups].sort((a, b) =>
    dayjs.utc(a.date).isAfter(dayjs.utc(b.date)) ? 1 : -1,
  );

  const mergedGroups: TimelineEventGroup[] = [];

  sortedGroups.forEach((currentGroup) => {
    if (mergedGroups.length === 0) {
      mergedGroups.push(currentGroup);
      return;
    }

    const lastGroup = _.last(mergedGroups);
    if (!lastGroup) {
      return;
    }

    const lastGroupDate = dayjs.utc(lastGroup.date);
    const currentGroupDate = dayjs.utc(currentGroup.date);

    const intervalsDiff =
      currentGroupDate.diff(lastGroupDate, interval.unit) / interval.count;
    const pixelDiff = intervalsDiff * intervalWidth;
    const lastGroupMinDistance = getMinDistanceFromTimelineEventGroup(
      lastGroup,
      renderingContext,
    );

    if (pixelDiff < lastGroupMinDistance) {
      const combinedEvents = [...lastGroup.events, ...currentGroup.events];
      mergedGroups[mergedGroups.length - 1] = {
        date: lastGroup.date,
        events: combinedEvents,
      };
    } else {
      mergedGroups.push(currentGroup);
    }
  });

  return mergedGroups;
};

const getTimelineEventsInsideRange = (
  timelineEvents: TimelineEvent[],
  range: DateRange,
  unit: SupportedUnit,
) => {
  const [min, max] = range;

  return timelineEvents.filter((event) => {
    return dayjs(event.timestamp).isBetween(min, max, unit, "[]");
  });
};

export const getTimelineEventsModel = (
  chartModel: BaseCartesianChartModel,
  chartMeasurements: ChartMeasurements,
  timelineEvents: TimelineEvent[],
  renderingContext: RenderingContext,
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
    chartModel.xAxisModel.interval.unit,
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
    chartMeasurements,
  );
  return mergeOverlappingTimelineEventGroups(
    timelineEventsByUnitStart,
    chartModel.xAxisModel.interval,
    intervalWidth,
    renderingContext,
  );
};
