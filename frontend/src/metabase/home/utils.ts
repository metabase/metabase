import type { MomentInput } from "moment-timezone";
import moment from "moment-timezone";
import { parseTimestamp } from "metabase/lib/time";

export const isWithinWeeks = (
  timestamp: MomentInput,
  weekCount: number,
): boolean => {
  const date = parseTimestamp(timestamp);
  const weeksAgo = moment().subtract(weekCount, "week");
  return date.isAfter(weeksAgo);
};
