import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import updateLocale from "dayjs/plugin/updateLocale";
dayjs.extend(updateLocale);
dayjs.extend(relativeTime);

export function getDateDisplay(date: string) {
  const dateObj = dayjs(date);
  const dayDiff = dayjs().diff(dateObj, "days");

  return dayDiff > 30 ? dateObj.format("MMM D, YYYY") : dateObj.fromNow();
}
