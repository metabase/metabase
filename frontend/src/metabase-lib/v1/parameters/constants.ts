import { t } from "ttag";

export const PARAMETER_OPERATOR_TYPES = {
  number: [
    {
      type: "number/=",
      operator: "=",
      name: t`Equal to`,
    },
    {
      type: "number/!=",
      operator: "!=",
      name: t`Not equal to`,
    },
    {
      type: "number/between",
      operator: "between",
      name: t`Between`,
    },
    {
      type: "number/>=",
      operator: ">=",
      name: t`Greater than or equal to`,
    },
    {
      type: "number/<=",
      operator: "<=",
      name: t`Less than or equal to`,
    },
  ],
  string: [
    {
      type: "string/=",
      operator: "=",
      name: t`Is`,
      description: t`Select one or more values from a list or search box.`,
    },
    {
      type: "string/!=",
      operator: "!=",
      name: t`Is not`,
      description: t`Exclude one or more specific values.`,
    },
    {
      type: "string/contains",
      operator: "contains",
      name: t`Contains`,
      description: t`Match values that contain the entered text.`,
    },
    {
      type: "string/does-not-contain",
      operator: "does-not-contain",
      name: t`Does not contain`,
      description: t`Filter out values that contain the entered text.`,
    },
    {
      type: "string/starts-with",
      operator: "starts-with",
      name: t`Starts with`,
      description: t`Match values that begin with the entered text.`,
    },
    {
      type: "string/ends-with",
      operator: "ends-with",
      name: t`Ends with`,
      description: t`Match values that end with the entered text.`,
    },
  ],
  date: [
    {
      type: "date/month-year",
      operator: "month-year",
      name: t`Month and Year`,
      description: t`Like January 2016`,
    },
    {
      type: "date/quarter-year",
      operator: "quarter-year",
      name: t`Quarter and Year`,
      description: t`Like Q1 2016`,
    },
    {
      type: "date/single",
      operator: "single",
      name: t`Single Date`,
      description: t`Like January 31, 2016`,
    },
    {
      type: "date/range",
      operator: "range",
      name: t`Date Range`,
      description: t`Like December 25, 2015 - February 14, 2016`,
    },
    {
      type: "date/relative",
      operator: "relative",
      name: t`Relative Date`,
      description: t`Like "the last 7 days" or "this month"`,
    },
    {
      type: "date/all-options",
      operator: "all-options",
      name: t`Date Filter`,
      menuName: t`All Options`,
      description: t`Contains all of the above`,
    },
  ],
} as const;

export const OPTIONS_WITH_OPERATOR_SUBTYPES = [
  {
    type: "date",
    typeName: t`Date`,
  },
  {
    type: "string",
    typeName: t`String`,
  },
  {
    type: "number",
    typeName: t`Number`,
  },
] as const;

export const ID_OPTION = {
  type: "id",
  name: t`ID`,
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
    name: t`Today`,
    mapping: ["=", null, ["relative-datetime", "current"]],
  },
  past1days: {
    name: t`Yesterday`,
    mapping: ["=", null, ["relative-datetime", -1, "day"]],
  },
  past7days: {
    name: t`Past 7 Days`,
    mapping: ["time-interval", null, -7, "day"],
  },
  past30days: {
    name: t`Past 30 Days`,
    mapping: ["time-interval", null, -30, "day"],
  },
  past1weeks: {
    name: t`Last Week`,
    mapping: ["time-interval", null, "last", "week"],
  },
  past1months: {
    name: t`Last Month`,
    mapping: ["time-interval", null, "last", "month"],
  },
  past1years: {
    name: t`Last Year`,
    mapping: ["time-interval", null, "last", "year"],
  },
  thisweek: {
    name: t`This Week`,
    mapping: ["time-interval", null, "current", "week"],
  },
  thismonth: {
    name: t`This Month`,
    mapping: ["time-interval", null, "current", "month"],
  },
  thisyear: {
    name: t`This Year`,
    mapping: ["time-interval", null, "current", "year"],
  },
};
