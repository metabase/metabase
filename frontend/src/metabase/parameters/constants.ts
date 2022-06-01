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
      name: t`Dropdown`,
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
      description: t`Like January, 2016`,
    },
    {
      type: "date/quarter-year",
      operator: "quarter-year",
      name: t`Quarter and Year`,
      description: t`Like Q1, 2016`,
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
};

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
];

export const ID_OPTION = {
  type: "id",
  name: t`ID`,
};

export const CATEGORY_OPTION = { type: "category", name: t`Category` };

export const LOCATION_OPTIONS = [
  {
    type: "location/city",
    name: t`City`,
  },
  {
    type: "location/state",
    name: t`State`,
  },
  {
    type: "location/zip_code",
    name: t`ZIP or Postal Code`,
  },
  {
    type: "location/country",
    name: t`Country`,
  },
];

export const TYPE_SUPPORTS_LINKED_FILTERS = [
  "string",
  "category",
  "id",
  "location",
];

export const FIELD_FILTER_PARAMETER_TYPES = [
  "date",
  "string",
  "number",
  "id",
  "category",
  "location",
];
