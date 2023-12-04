import { t } from "ttag";
import type { ExcludeOperatorOption, ExcludeUnitOption } from "./types";

export const EXCLUDE_UNIT_OPTIONS: ExcludeUnitOption[] = [
  {
    unit: "day-of-week",
    label: t`Days of the week…`,
  },
  {
    unit: "month-of-year",
    label: t`Months of the year…`,
  },
  {
    unit: "quarter-of-year",
    label: t`Quarters of the year…`,
  },
  {
    unit: "hour-of-day",
    label: t`Hours of the day…`,
  },
];

export const EXCLUDE_OPERATOR_OPTIONS: ExcludeOperatorOption[] = [
  {
    operator: "not-null",
    label: t`Is empty`,
  },
  {
    operator: "is-null",
    label: t`Is not empty`,
  },
];
