import dayjs from "dayjs";

import { parseTimestamp } from "metabase/lib/time-dayjs";

export const isWithinWeeks = (
  timestamp: string,
  weekCount: number,
): boolean => {
  const date = parseTimestamp(timestamp);
  const weeksAgo = dayjs().subtract(weekCount, "week");
  return date.isAfter(weeksAgo);
};
