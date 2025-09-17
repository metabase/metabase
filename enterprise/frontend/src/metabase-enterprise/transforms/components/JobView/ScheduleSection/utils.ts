import { getScheduleExplanation } from "metabase/lib/cron";
import { timezoneToUTCOffset } from "metabase/lib/time-dayjs";

export function getScheduleExplanationWithTimezone(
  schedule: string,
  timezone: string,
) {
  const scheduleExplanation = getScheduleExplanation(schedule);
  const timezoneOffset = timezoneToUTCOffset(timezone);
  const timezoneExplanation =
    timezoneOffset === "+00:00" ? "UTC" : `UTC${timezoneOffset}`;

  if (scheduleExplanation == null) {
    return null;
  }

  return `${scheduleExplanation}, ${timezoneExplanation}`;
}
