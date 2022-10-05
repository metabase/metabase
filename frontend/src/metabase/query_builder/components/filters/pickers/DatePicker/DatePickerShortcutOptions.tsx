import { t } from "ttag";
import moment from "moment-timezone";

import Dimension from "metabase-lib/lib/Dimension";
import Filter from "metabase-lib/lib/queries/structured/Filter";

function getDateTimeDimension(mbql: any, bucketing?: string) {
  const dimension = Dimension.parseMBQL(mbql);
  if (dimension) {
    if (bucketing) {
      return dimension.withTemporalUnit(bucketing).mbql();
    } else {
      return dimension.withoutTemporalBucketing().mbql();
    }
  }
  return mbql;
}

type Option = {
  displayName: string;
  init: (filter: Filter) => any;
};

const DAY_OPTIONS: Option[] = [
  {
    displayName: t`Today`,
    init: filter => [
      "time-interval",
      getDateTimeDimension(filter[1]),
      "current",
      "day",
      { include_current: true },
    ],
  },
  {
    displayName: t`Yesterday`,
    init: filter => [
      "time-interval",
      getDateTimeDimension(filter[1]),
      -1,
      "day",
      { include_current: false },
    ],
  },
  {
    displayName: t`Last Week`,
    init: filter => [
      "time-interval",
      getDateTimeDimension(filter[1]),
      -1,
      "week",
      { include_current: false },
    ],
  },
  {
    displayName: t`Last 7 Days`,
    init: filter => [
      "time-interval",
      getDateTimeDimension(filter[1]),
      -7,
      "day",
      { include_current: false },
    ],
  },
  {
    displayName: t`Last 30 Days`,
    init: filter => [
      "time-interval",
      getDateTimeDimension(filter[1]),
      -30,
      "day",
      { include_current: false },
    ],
  },
];

const MONTH_OPTIONS: Option[] = [
  {
    displayName: t`Last Month`,
    init: filter => [
      "time-interval",
      getDateTimeDimension(filter[1]),
      -1,
      "month",
      { include_current: false },
    ],
  },
  {
    displayName: t`Last 3 Months`,
    init: filter => [
      "time-interval",
      getDateTimeDimension(filter[1]),
      -3,
      "month",
      { include_current: false },
    ],
  },
  {
    displayName: t`Last 12 Months`,
    init: filter => [
      "time-interval",
      getDateTimeDimension(filter[1]),
      -12,
      "month",
      { include_current: false },
    ],
  },
];

const MISC_OPTIONS: Option[] = [
  {
    displayName: t`Specific dates...`,
    init: filter => [
      "between",
      getDateTimeDimension(filter[1]),
      moment().subtract(30, "day").format("YYYY-MM-DD"),
      moment().format("YYYY-MM-DD"),
    ],
  },
  {
    displayName: t`Relative dates...`,
    init: filter => [
      "time-interval",
      getDateTimeDimension(filter[1]),
      -30,
      "day",
    ],
  },
  {
    displayName: t`Exclude...`,
    init: filter => ["!=", getDateTimeDimension(filter[1])],
  },
];

export interface DateShortcutOptions {
  DAY_OPTIONS: Option[];
  MONTH_OPTIONS: Option[];
  MISC_OPTIONS: Option[];
}

export const DATE_SHORTCUT_OPTIONS: DateShortcutOptions = {
  DAY_OPTIONS,
  MONTH_OPTIONS,
  MISC_OPTIONS,
};
