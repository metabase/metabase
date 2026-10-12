import { dayjs } from "metabase/dayjs";

export function getDateDisplay(date: string) {
  const dateObj = dayjs(date);
  const dayDiff = dayjs().diff(dateObj, "days");

  return dayDiff > 30 ? dateObj.format("MMM D, YYYY") : dateObj.fromNow();
}
