import { setLocalization } from "metabase/lib/i18n";
import type { DateFilterValue } from "metabase/querying/common/types";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";
import type { DateFormattingSettings } from "metabase-types/api";

import {
  formatDate,
  getDateFilterClause,
  getDateFilterDisplayName,
} from "./dates";

type DateFilterClauseCase = {
  value: DateFilterValue;
  displayName: string;
};

describe("getDateFilterClause", () => {
  const query = createQuery();
  const stageIndex = 0;
  const columns = Lib.filterableColumns(query, stageIndex);
  const findColumn = columnFinder(query, columns);
  const column = findColumn("ORDERS", "CREATED_AT");

  it.each<DateFilterClauseCase>([
    {
      value: {
        type: "specific",
        operator: "=",
        values: [new Date(2024, 1, 2)],
        hasTime: false,
      },
      displayName: "Created At is on Feb 2, 2024",
    },
    {
      value: {
        type: "specific",
        operator: "=",
        values: [new Date(2024, 1, 2)],
        hasTime: true,
      },
      displayName: "Created At is Feb 2, 2024, 12:00 AM",
    },
    {
      value: {
        type: "specific",
        operator: ">",
        values: [new Date(2024, 1, 2)],
        hasTime: false,
      },
      displayName: "Created At is after Feb 2, 2024",
    },
    {
      value: {
        type: "specific",
        operator: "<",
        values: [new Date(2024, 1, 2)],
        hasTime: false,
      },
      displayName: "Created At is before Feb 2, 2024",
    },
    {
      value: {
        type: "specific",
        operator: "between",
        values: [new Date(2024, 1, 2), new Date(2024, 11, 20)],
        hasTime: false,
      },
      displayName: "Created At is Feb 2 – Dec 20, 2024",
    },
    {
      value: { type: "relative", value: 0, unit: "day" },
      displayName: "Created At is today",
    },
    {
      value: { type: "relative", value: -2, unit: "year" },
      displayName: "Created At is in the previous 2 years",
    },
    {
      value: {
        type: "relative",
        value: -2,
        unit: "year",
        offsetValue: -1,
        offsetUnit: "year",
      },
      displayName: "Created At is in the previous 2 years, starting 1 year ago",
    },
    {
      value: { type: "relative", value: 4, unit: "month" },
      displayName: "Created At is in the next 4 months",
    },
    {
      value: {
        type: "relative",
        value: 4,
        unit: "month",
        offsetValue: 2,
        offsetUnit: "quarter",
      },
      displayName:
        "Created At is in the next 4 months, starting 2 quarters from now",
    },
    {
      value: { type: "exclude", operator: "is-null", values: [] },
      displayName: "Created At is empty",
    },
    {
      value: { type: "exclude", operator: "not-null", values: [] },
      displayName: "Created At is not empty",
    },
    {
      value: {
        type: "exclude",
        operator: "!=",
        values: [23],
        unit: "hour-of-day",
      },
      displayName: "Created At excludes the hour of 11 PM",
    },
    {
      value: { type: "month", year: 2024, month: 1 },
      displayName: "Created At is Jan 1–31, 2024",
    },
    {
      value: { type: "month", year: 2024, month: 12 },
      displayName: "Created At is Dec 1–31, 2024",
    },
    {
      value: { type: "quarter", year: 2020, quarter: 1 },
      displayName: "Created At is Jan 1 – Mar 31, 2020",
    },
    {
      value: { type: "quarter", year: 2020, quarter: 4 },
      displayName: "Created At is Oct 1 – Dec 31, 2020",
    },
  ])(
    "should convert a filter value to a filter clause",
    ({ value, displayName }) => {
      const filter = getDateFilterClause(column, value);
      expect(Lib.displayInfo(query, stageIndex, filter)).toMatchObject({
        displayName,
      });
    },
  );
});

type DateFilterDisplayNameCase = {
  value: DateFilterValue;
  displayName: string;
  withPrefix?: boolean;
  formattingSettings?: DateFormattingSettings;
};

describe("getDateFilterDisplayName", () => {
  it.each<DateFilterDisplayNameCase>([
    {
      value: {
        type: "specific",
        operator: "=",
        values: [new Date(2024, 2, 5)],
        hasTime: false,
      },
      displayName: "March 5, 2024",
    },
    {
      value: {
        type: "specific",
        operator: "=",
        values: [new Date(2024, 2, 5, 10, 20)],
        hasTime: true,
      },
      displayName: "March 5, 2024 10:20 AM",
    },
    {
      value: {
        type: "specific",
        operator: "=",
        values: [new Date(2024, 2, 5)],
        hasTime: false,
      },
      withPrefix: true,
      displayName: "On March 5, 2024",
    },
    {
      value: {
        type: "specific",
        operator: ">",
        values: [new Date(2024, 2, 5)],
        hasTime: false,
      },
      displayName: "After March 5, 2024",
    },
    {
      value: {
        type: "specific",
        operator: "<",
        values: [new Date(2024, 2, 5)],
        hasTime: false,
      },
      displayName: "Before March 5, 2024",
    },
    {
      value: {
        type: "specific",
        operator: "between",
        values: [new Date(2024, 0, 1), new Date(2024, 11, 31)],
        hasTime: false,
      },
      displayName: "January 1, 2024 - December 31, 2024",
    },
    {
      value: {
        type: "specific",
        operator: "between",
        values: [new Date(2024, 0, 1, 10, 20), new Date(2024, 11, 31, 23, 15)],
        hasTime: true,
      },
      displayName: "January 1, 2024 10:20 AM - December 31, 2024 11:15 PM",
    },
    {
      value: { type: "relative", value: 0, unit: "day" },
      displayName: "Today",
    },
    {
      value: { type: "relative", value: 0, unit: "year" },
      displayName: "This year",
    },
    {
      value: { type: "relative", value: -1, unit: "day" },
      displayName: "Yesterday",
    },
    {
      value: { type: "relative", value: -2, unit: "year" },
      displayName: "Previous 2 years",
    },
    {
      value: {
        type: "relative",
        value: -3,
        unit: "month",
        offsetValue: -1,
        offsetUnit: "year",
      },
      displayName: "Previous 3 months, starting 1 year ago",
    },
    {
      value: { type: "relative", value: 2, unit: "month" },
      displayName: "Next 2 months",
    },
    {
      value: {
        type: "relative",
        value: 3,
        unit: "month",
        offsetValue: 1,
        offsetUnit: "year",
      },
      displayName: "Next 3 months, starting 1 year from now",
    },
    {
      value: {
        type: "exclude",
        operator: "!=",
        values: [0, 23],
        unit: "hour-of-day",
      },
      displayName: "Exclude 12 AM, 11 PM",
    },
    {
      value: {
        type: "exclude",
        operator: "!=",
        values: [0, 11, 23],
        unit: "hour-of-day",
      },
      displayName: "Exclude 3 selections",
    },
    {
      value: {
        type: "exclude",
        operator: "!=",
        values: [1, 7],
        unit: "day-of-week",
      },
      displayName: "Exclude Monday, Sunday",
    },
    {
      value: {
        type: "exclude",
        operator: "!=",
        values: [1, 12],
        unit: "month-of-year",
      },
      displayName: "Exclude January, December",
    },
    {
      value: {
        type: "exclude",
        operator: "!=",
        values: [1, 4],
        unit: "quarter-of-year",
      },
      displayName: "Exclude Q1, Q4",
    },
    {
      value: {
        type: "exclude",
        operator: "is-null",
        values: [],
      },
      displayName: "Is empty",
    },
    {
      value: {
        type: "exclude",
        operator: "not-null",
        values: [],
      },
      displayName: "Not empty",
    },
    {
      value: {
        type: "specific",
        operator: "=",
        values: [new Date(2024, 2, 5)],
        hasTime: false,
      },
      formattingSettings: {
        date_style: "dddd MMMM D, YYYY",
      },
      displayName: "Tuesday March 5, 2024",
    },
    {
      value: {
        type: "specific",
        operator: "=",
        values: [new Date(2024, 2, 5)],
        hasTime: false,
      },
      formattingSettings: {
        date_style: "dddd MMMM D, YYYY",
        date_abbreviate: true,
      },
      displayName: "Tue Mar 5, 2024",
    },
    {
      value: {
        type: "specific",
        operator: "=",
        values: [new Date(2024, 2, 5)],
        hasTime: true,
      },
      formattingSettings: {
        date_style: "dddd MMMM D, YYYY",
        date_abbreviate: true,
      },
      displayName: "Tue Mar 5, 2024 12:00 AM",
    },
  ])(
    "should format a relative date filter",
    ({ value, displayName, withPrefix, formattingSettings }) => {
      expect(
        getDateFilterDisplayName(value, { withPrefix, formattingSettings }),
      ).toEqual(displayName);
    },
  );
});

describe("formatDate", () => {
  afterAll(() => jest.resetModules());

  describe.each([{ hasTime: false }, { hasTime: true }])(
    "with hasTime=$hasTime",
    ({ hasTime }) => {
      it.each([
        { locale: "en", expectedDate: "January 2, 2025" },
        { locale: "de", expectedDate: "2. Januar 2025" },
      ])("respects locale $locale", ({ locale, expectedDate }) => {
        setLocalization({
          headers: {
            language: locale,
            "plural-forms": "nplurals=2; plural=(n != 1);",
          },
          translations: { "": {} },
        });

        const date = new Date(2025, 0, 2, 0, 0);
        const expectedTime = hasTime ? " 12:00 AM" : "";
        const expected = `${expectedDate}${expectedTime}`;
        expect(formatDate(date, hasTime)).toBe(expected);
      });
    },
  );
});
