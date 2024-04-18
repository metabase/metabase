import type { Dayjs, OpUnitType } from "dayjs";
import dayjs from "dayjs";
import _ from "underscore";
import type { RowValue, TimelineEvent } from "metabase-types/api";
import type { CartesianChartModel } from "metabase/visualizations/echarts/cartesian/model/types";
import type {
  DateRange,
  TimelineEventGroup,
} from "metabase/visualizations/echarts/cartesian/timeline-events/types";
import { getChartMeasurements } from "metabase/visualizations/echarts/cartesian/utils/layout";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import { CHART_STYLE } from "metabase/visualizations/echarts/cartesian/constants/style";
import type { ChartMeasurements } from "../option/types";

const tryGetDate = (rowValue: RowValue): Dayjs | null => {
  if (typeof rowValue === "boolean") {
    return null;
  }
  const date = dayjs(rowValue);
  return date.isValid() ? date : null;
};

const getDimensionRange = (
  chartModel: CartesianChartModel,
): DateRange | null => {
  const {
    transformedDataset,
    dimensionModel: { dataKey: dimensionKey },
  } = chartModel;
  if (chartModel.transformedDataset.length === 0) {
    return null;
  }

  // Assume the dataset is sorted
  const minDate = tryGetDate(transformedDataset[0][dimensionKey]);
  const maxDate = tryGetDate(
    transformedDataset[transformedDataset.length - 1][dimensionKey],
  );

  if (minDate == null || maxDate == null) {
    return null;
  }

  return [minDate, maxDate];
};

const getDayWidth = (
  range: DateRange,
  chartMeasurements: ChartMeasurements,
  width: number,
) => {
  const daysCount = Math.abs(dayjs(range[1]).diff(range[0], "day"));

  const boundaryWidth =
    width -
    chartMeasurements.padding.left -
    chartMeasurements.padding.right -
    chartMeasurements.ticksDimensions.yTicksWidthLeft -
    chartMeasurements.ticksDimensions.yTicksWidthRight;

  return boundaryWidth / daysCount;
};

const groupEventsByUnitStart = (
  events: TimelineEvent[],
  unit: string = "day",
): TimelineEventGroup[] => {
  const groupedEvents = events.reduce<Map<string, TimelineEvent[]>>(
    (acc, event) => {
      const unitStart = dayjs(event.timestamp)
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
    dayjs(a.date).isAfter(dayjs(b.date)) ? 1 : -1,
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

    const lastGroupDate = dayjs(lastGroup.date);
    const currentGroupDate = dayjs(currentGroup.date);

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
  chartModel: CartesianChartModel,
  timelineEvents: TimelineEvent[],
  settings: ComputedVisualizationSettings,
  width: number,
  renderingContext: RenderingContext,
) => {
  if (timelineEvents.length === 0) {
    return null;
  }

  const dimensionRange = getDimensionRange(chartModel);
  if (!dimensionRange) {
    return null;
  }

  const visibleTimelineEvents = getTimelineEventsInsideRange(
    timelineEvents,
    dimensionRange,
  );

  const hasTimelineEvents = visibleTimelineEvents.length === 0;
  if (hasTimelineEvents) {
    return null;
  }

  const timelineEventsByUnitStart = groupEventsByUnitStart(
    timelineEvents,
    chartModel.dimensionModel.column.unit ?? "day", // TODO: compute binning unit for native questions
  );

  const chartMeasurements = getChartMeasurements(
    chartModel,
    settings,
    hasTimelineEvents,
    renderingContext,
  );

  const dayWidth = getDayWidth(dimensionRange, chartMeasurements, width);
  return mergeOverlappingTimelineEventGroups(
    timelineEventsByUnitStart,
    dayWidth,
    renderingContext,
  );
};
