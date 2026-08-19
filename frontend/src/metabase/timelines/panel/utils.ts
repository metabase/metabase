import dayjs, { type Dayjs } from "dayjs";
import { updateIn } from "icepick";
import { t } from "ttag";
import _ from "underscore";

import { getSortedTimelines } from "metabase/common/utils/timelines";
import { parseTimestamp } from "metabase/utils/time-dayjs";
import { formatDateTimeWithUnit } from "metabase/value-formatting";
import type {
  CartesianChartDateTimeAbsoluteUnit,
  DateRange,
  TimeSeriesInterval,
  TimeseriesXAxis,
} from "metabase/viz-core";
import type {
  DateTimeAbsoluteUnit,
  Timeline,
  TimelineEvent,
  TimelineEventId,
} from "metabase-types/api";
import { isAbsoluteDateTimeUnit } from "metabase-types/guards/date-time";

export const transformTimelines = (timelines: Timeline[]): Timeline[] =>
  getSortedTimelines(
    timelines.map((timeline) =>
      updateIn(timeline, ["events"], (events: TimelineEvent[] = []) =>
        _.chain(events)
          .map((event) => updateIn(event, ["timestamp"], parseTimestamp))
          .filter((event) => !event.archived)
          .value(),
      ),
    ),
  );

const filterTimelineEvents = (
  timelines: Timeline[],
  predicate: (event: TimelineEvent) => boolean,
): Timeline[] =>
  timelines
    .map((timeline) => ({
      ...timeline,
      events: (timeline.events ?? []).filter(predicate),
    }))
    .filter((timeline) => timeline.events.length > 0);

const extendDomainToLastInterval = (
  [start, end]: DateRange,
  interval: TimeSeriesInterval | null,
): DateRange => {
  if (!isAbsoluteDateTimeUnit(interval?.unit)) {
    return [start, end];
  }
  const extendedEnd = end.clone().add(interval.count, interval.unit);
  const isSubDayUnit = interval.unit === "hour" || interval.unit === "minute";
  return [start, isSubDayUnit ? extendedEnd : extendedEnd.subtract(1, "day")];
};

export const filterTimelinesByXAxis = (
  timelines: Timeline[],
  xAxis: TimeseriesXAxis | null,
): Timeline[] => {
  const domain = xAxis?.domain
    ? extendDomainToLastInterval(xAxis.domain, xAxis.interval)
    : null;
  return filterTimelineEvents(
    timelines,
    (event) =>
      !domain ||
      dayjs(event.timestamp).isBetween(domain[0], domain[1], undefined, "[]"),
  );
};

export const filterVisibleTimelineEvents = (
  timelines: Timeline[],
  visibleEventIds: TimelineEventId[],
): TimelineEvent[] => {
  const visibleIds = new Set(visibleEventIds);
  return _.sortBy(
    timelines
      .flatMap((timeline) => timeline.events ?? [])
      .filter((event) => visibleIds.has(event.id)),
    (event) => event.timestamp,
  );
};

export const getFocusedTimelines = (
  timelines: Timeline[],
  focusedTimelineEventIds: TimelineEventId[] | null,
): Timeline[] => {
  if (focusedTimelineEventIds == null) {
    return timelines;
  }
  const focusedIds = new Set(focusedTimelineEventIds);
  return filterTimelineEvents(timelines, (event) => focusedIds.has(event.id));
};

export const getEventsXDomain = (
  timelines: Timeline[],
): DateRange | undefined => {
  const timestamps = timelines
    .flatMap((timeline) => timeline.events ?? [])
    .map((event) => dayjs.utc(event.timestamp));

  if (timestamps.length === 0) {
    return undefined;
  }

  const min = timestamps.reduce((a, b) => (b.isBefore(a) ? b : a));
  const max = timestamps.reduce((a, b) => (b.isAfter(a) ? b : a));
  return [min, max];
};

const isPeriodUnit = (unit: DateTimeAbsoluteUnit) =>
  unit === "week" || unit === "month" || unit === "quarter" || unit === "year";

export const formatTitle = (
  xDomain?: DateRange,
  unit?: CartesianChartDateTimeAbsoluteUnit,
) => {
  if (!xDomain) {
    return t`Events`;
  }
  const bucketUnit = isAbsoluteDateTimeUnit(unit) ? unit : undefined;
  const startLabel = formatDate(xDomain[0], bucketUnit);
  const endLabel = formatDate(xDomain[1], bucketUnit);
  if (startLabel !== endLabel) {
    return t`Events between ${startLabel} and ${endLabel}`;
  }

  return bucketUnit && isPeriodUnit(bucketUnit)
    ? t`Events in ${startLabel}`
    : t`Events on ${startLabel}`;
};

const formatDate = (date: Dayjs, unit?: DateTimeAbsoluteUnit) =>
  unit == null
    ? date.format("ll")
    : formatDateTimeWithUnit(date.startOf(unit), unit);
