import { Moment } from "moment";

export function formatTime(value: number) {
  return value < 10 ? `0${value}` : value;
}

export function getNextExpectedRefreshTime(
  fromTime: Moment,
  refreshInterval: number,
  anchorTime: string,
) {
  const nextRefresh = fromTime.clone();
  nextRefresh.add(refreshInterval, "hours");

  const isNextDay = nextRefresh.date() !== fromTime.date();
  if (isNextDay) {
    const [hours, minutes] = anchorTime
      .split(":")
      .map(number => parseInt(number, 10));
    nextRefresh.hours(hours);
    nextRefresh.minutes(minutes);
  }

  return nextRefresh;
}
