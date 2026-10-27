import { dayjs } from "metabase/dayjs";
import { parseTimestamp } from "metabase/utils/time-dayjs";

/**
 * Event timestamps are displayed with the wall clock written in the stored UTC
 * string, so the form reads and writes that wall clock too, not the browser one.
 */
export function getTimestampWithDate(
  timestamp: string,
  date: string,
  timeMatters: boolean,
): string {
  const newDate = parseTimestamp(date);
  if (!timeMatters) {
    return newDate.toISOString();
  }

  // if time matters, preserve the time part of the timestamp
  // when changing the date part
  const timePart = dayjs.tz(timestamp);
  return newDate
    .set("hour", timePart.hour())
    .set("minute", timePart.minute())
    .toISOString();
}

export function getTimestampWithTime(timestamp: string, time: Date): string {
  const timePart = dayjs.tz(time);
  return parseTimestamp(timestamp)
    .set("hour", timePart.hour())
    .set("minute", timePart.minute())
    .toISOString();
}

export function getTimeInputValue(timestamp: string): Date {
  return dayjs.tz(timestamp).toDate();
}
