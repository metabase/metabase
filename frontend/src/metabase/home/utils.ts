import type { ConfigType } from "dayjs";
import dayjs from "dayjs";

import { parseTimestamp } from "metabase/lib/time";

export const isWithinWeeks = (
  timestamp: ConfigType,
  weekCount: number,
): boolean => {
  const date = parseTimestamp(timestamp);
  const weeksAgo = dayjs().subtract(weekCount, "week");
  return date.isAfter(weeksAgo);
};
