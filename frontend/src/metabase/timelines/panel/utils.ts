import { updateIn } from "icepick";
import { t } from "ttag";
import _ from "underscore";

import { getSortedTimelines } from "metabase/common/utils/timelines";
import { type Dayjs, dayjs } from "metabase/dayjs";
import { parseTimestamp } from "metabase/utils/time-dayjs";
import { formatDateTimeWithUnit } from "metabase/value-formatting";
import {
  type CartesianChartDateTimeAbsoluteUnit,
  type DateRange,
  type TimeseriesXAxis,
  isTimelineEventInRange,
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

export const getNonEmptyTimelines = (timelines: Timeline[]): Timeline[] =>
  timelines.filter((timeline) => (timeline.events ?? []).length > 0);

export const filterTimelinesByXAxis = (
  timelines: Timeline[],
  xAxis: TimeseriesXAxis | null,
): Timeline[] => {
  const domain = xAxis?.domain;
  if (!domain) {
    return getNonEmptyTimelines(timelines);
  }
  const interval = xAxis?.interval ?? null;
  return filterTimelineEvents(timelines, (event) =>
    isTimelineEventInRange(event, domain, interval),
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

export const getTimelineSidebarTitle = ({
  focusedTimelines,
  isFocused,
  xAxis,
}: {
  focusedTimelines: Timeline[];
  isFocused: boolean;
  xAxis: TimeseriesXAxis | null | undefined;
}) =>
  isFocused
    ? formatTitle(getEventsXDomain(focusedTimelines), xAxis?.interval?.unit)
    : formatTitle(xAxis?.domain ?? undefined);

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
