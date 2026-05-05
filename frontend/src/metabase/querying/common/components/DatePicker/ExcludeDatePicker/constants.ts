import { t } from "ttag";

import type { ExcludeOperatorOption, ExcludeUnitOption } from "./types";

export const EXCLUDE_UNIT_OPTIONS: ExcludeUnitOption[] = [
  {
    unit: "day-of-week",
    get label() {
      return t`Days of the week…`;
    },
  },
  {
    unit: "month-of-year",
    get label() {
      return t`Months of the year…`;
    },
  },
  {
    unit: "quarter-of-year",
    get label() {
      return t`Quarters of the year…`;
    },
  },
  {
    unit: "hour-of-day",
    get label() {
      return t`Hours of the day…`;
    },
  },
];

export const EXCLUDE_OPERATOR_OPTIONS: ExcludeOperatorOption[] = [
  {
    operator: "not-null",
    get label() {
      return t`Empty values`;
    },
  },
  {
    operator: "is-null",
    get label() {
      return t`Not empty values`;
    },
  },
];
