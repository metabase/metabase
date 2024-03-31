import type { OpUnitType } from "dayjs";
import dayjs from "dayjs";
import _ from "underscore";

import { CHART_STYLE } from "metabase/visualizations/echarts/cartesian/constants/style";
import type {
  BaseCartesianChartModel,
  DateRange,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type { TimelineEventGroup } from "metabase/visualizations/echarts/cartesian/timeline-events/types";
import type { RenderingContext } from "metabase/visualizations/types";
import type { TimelineEvent } from "metabase-types/api";

import type { ChartMeasurements } from "../chart-measurements/types";
import { isTimeSeriesAxis } from "../model/guards";

const getDayWidth = (
  range: DateRange,
  chartMeasurements: ChartMeasurements,
) => {
  const daysCount = Math.abs(dayjs(range[1]).diff(range[0], "day"));

  return chartMeasurements.boundaryWidth / daysCount;
};

const groupEventsByUnitStart = (
  events: TimelineEvent[],
  unit: string = "day",
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
  dayWidth: number,
  renderingContext: RenderingContext,
): TimelineEventGroup[] => {
  const sortedGroups = [...eventGroups].sort((a, b) =>
    dayjs.utc(a.date).isAfter(dayjs.utc(b.date)) ? 1 : -1,
  );

  const mergedGroups: TimelineEventGroup[] = [];

  sortedGroups.forEach(currentGroup => {
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

    const daysDiff = currentGroupDate.diff(lastGroupDate, "day");
    const pixelDiff = daysDiff * dayWidth;
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
) => {
  const [min, max] = range;
  return timelineEvents.filter(event => {
    return (
      (min.isSame(event.timestamp) || min.isBefore(event.timestamp)) &&
      (max.isSame(event.timestamp) || max.isAfter(event.timestamp))
    );
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
  );

  const hasTimelineEvents = visibleTimelineEvents.length !== 0;
  if (!hasTimelineEvents) {
    return null;
  }

  const timelineEventsByUnitStart = groupEventsByUnitStart(
    timelineEvents,
    chartModel.xAxisModel.interval.unit,
  );

  const dayWidth = getDayWidth(dimensionRange, chartMeasurements);
  return mergeOverlappingTimelineEventGroups(
    timelineEventsByUnitStart,
    dayWidth,
    renderingContext,
  );
};
