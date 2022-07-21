import { t } from "ttag";
import moment from "moment";

const buildStartAndEndDates = (period: string, format: string) => {
  const now = moment();
  const start = now.startOf(period).format(format);
  const end = now.endOf(period).format(format);

  return [start, end];
};

export const periodPopoverText = (period: string) => {
  const format = period === "year" ? "MMM D, YYYY" : "ddd, MMM D";

  if (period === "day") {
    return t`Right now, this is ${moment().format(format)}`;
  }

  const [start, end] = buildStartAndEndDates(period, format);

  return t`Right now, this is ${start} - ${end}`;
};
