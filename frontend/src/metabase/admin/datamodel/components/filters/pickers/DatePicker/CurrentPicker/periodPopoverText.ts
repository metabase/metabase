import type { unitOfTime } from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import { t } from "ttag";

const buildStartAndEndDates = (period: unitOfTime.StartOf, format: string) => {
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

  const [start, end] = buildStartAndEndDates(
    period as unitOfTime.StartOf,
    format,
  );

  return t`Right now, this is ${start} - ${end}`;
};
