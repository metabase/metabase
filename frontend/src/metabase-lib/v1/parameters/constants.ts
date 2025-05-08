import { t } from "ttag";

export const PARAMETER_OPERATOR_TYPES = {
  number: [
    {
      type: "number/=",
      operator: "=",
      get name() {
        return t`Number`;
      },
      get menuName() {
        return t`Equal to`;
      },
    },
    {
      type: "number/!=",
      operator: "!=",
      get name() {
        return t`Not equal to`;
      },
    },
    {
      type: "number/between",
      operator: "between",
      get name() {
        return t`Between`;
      },
    },
    {
      type: "number/>=",
      operator: ">=",
      get name() {
        return t`Greater than or equal to`;
      },
    },
    {
      type: "number/<=",
      operator: "<=",
      get name() {
        return t`Less than or equal to`;
      },
    },
  ],
  string: [
    {
      type: "string/=",
      operator: "=",
      get name() {
        return t`Is`;
      },
      get description() {
        return t`Select one or more values from a list or search box.`;
      },
    },
    {
      type: "string/!=",
      operator: "!=",
      get name() {
        return t`Is not`;
      },
      get description() {
        return t`Exclude one or more specific values.`;
      },
    },
    {
      type: "string/contains",
      operator: "contains",
      get name() {
        return t`Contains`;
      },
      get description() {
        return t`Match values that contain the entered text.`;
      },
    },
    {
      type: "string/does-not-contain",
      operator: "does-not-contain",
      get name() {
        return t`Does not contain`;
      },
      get description() {
        return t`Filter out values that contain the entered text.`;
      },
    },
    {
      type: "string/starts-with",
      operator: "starts-with",
      get name() {
        return t`Starts with`;
      },
      get description() {
        return t`Match values that begin with the entered text.`;
      },
    },
    {
      type: "string/ends-with",
      operator: "ends-with",
      get name() {
        return t`Ends with`;
      },
      get description() {
        return t`Match values that end with the entered text.`;
      },
    },
  ],
  date: [
    {
      type: "date/month-year",
      operator: "month-year",
      get name() {
        return t`Month and Year`;
      },
      get description() {
        return t`Like January 2016`;
      },
    },
    {
      type: "date/quarter-year",
      operator: "quarter-year",
      get name() {
        return t`Quarter and Year`;
      },
      get description() {
        return t`Like Q1 2016`;
      },
    },
    {
      type: "date/single",
      operator: "single",
      get name() {
        return t`Single Date`;
      },
      get description() {
        return t`Like January 31, 2016`;
      },
    },
    {
      type: "date/range",
      operator: "range",
      get name() {
        return t`Date Range`;
      },
      get description() {
        return t`Like December 25, 2015 - February 14, 2016`;
      },
    },
    {
      type: "date/relative",
      operator: "relative",
      get name() {
        return t`Relative Date`;
      },
      get description() {
        return t`Like "the previous 7 days" or "this month"`;
      },
    },
    {
      type: "date/all-options",
      operator: "all-options",
      get name() {
        return t`Date`;
      },
      get menuName() {
        return t`All Options`;
      },
      get description() {
        return t`Contains all of the above`;
      },
    },
  ],
} as const;

export const OPTIONS_WITH_OPERATOR_SUBTYPES = [
  {
    type: "date",
    get typeName() {
      return t`Date`;
    },
  },
  {
    type: "string",
    get typeName() {
      return t`String`;
    },
  },
  {
    type: "number",
    get typeName() {
      return t`Number`;
    },
  },
] as const;

export const ID_OPTION = {
  type: "id",
  get name() {
    return t`ID`;
  },
} as const;

export const TYPE_SUPPORTS_LINKED_FILTERS = [
  "string",
  "category",
  "id",
  "location",
] as const;

export const SINGLE_OR_MULTI_SELECTABLE_TYPES: Record<
  string,
  string | string[]
> = {
  string: [
    "=",
    "!=",
    "contains",
    "does-not-contain",
    "starts-with",
    "ends-with",
  ],
  category: "any",
  id: "any",
  location: ["=", "!="],
  number: ["=", "!="],
};

export const FIELD_FILTER_PARAMETER_TYPES = [
  "date",
  "string",
  "number",
  "id",
  "category",
  "location",
];

type FilterMap = {
  [name: string]: {
    name: string;
    mapping: any[];
  };
};

export const DATE_MBQL_FILTER_MAPPING: FilterMap = {
  thisday: {
    get name() {
      return t`Today`;
    },
    mapping: ["=", null, ["relative-datetime", "current"]],
  },
  past1days: {
    get name() {
      return t`Yesterday`;
    },
    mapping: ["=", null, ["relative-datetime", -1, "day"]],
  },
  past7days: {
    get name() {
      return t`Previous 7 Days`;
    },
    mapping: ["time-interval", null, -7, "day"],
  },
  past30days: {
    get name() {
      return t`Previous 30 Days`;
    },
    mapping: ["time-interval", null, -30, "day"],
  },
  past1weeks: {
    get name() {
      return t`Previous Week`;
    },
    mapping: ["time-interval", null, "previous", "week"],
  },
  past1months: {
    get name() {
      return t`Previous Month`;
    },
    mapping: ["time-interval", null, "previous", "month"],
  },
  past1years: {
    get name() {
      return t`Previous Year`;
    },
    mapping: ["time-interval", null, "previous", "year"],
  },
  thisweek: {
    get name() {
      return t`This Week`;
    },
    mapping: ["time-interval", null, "current", "week"],
  },
  thismonth: {
    get name() {
      return t`This Month`;
    },
    mapping: ["time-interval", null, "current", "month"],
  },
  thisyear: {
    get name() {
      return t`This Year`;
    },
    mapping: ["time-interval", null, "current", "year"],
  },
};
