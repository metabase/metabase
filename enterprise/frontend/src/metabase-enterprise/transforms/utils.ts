import dayjs from "dayjs";

export function formatTimestamp(timestamp: string) {
  return dayjs(timestamp).local().format("lll");
}
