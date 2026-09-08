import { computeComparisonStrPreviousValue } from "metabase/visualizations/visualizations/SmartScalar/compute";
import { createMockColumn } from "metabase-types/api/mocks";

// The comparison label condenses same-day/same-year date parts based on the
// wall-clock values, so it must render identically in every machine timezone.
// This runs under the multi-timezone harness (`bun run test-timezones`), which
// would have caught the moment -> dayjs regression where `isSame` went through
// the machine-local frame. It drives the label function directly: the cljs
// modules in the wider import graph are load-only mocks in jest.tz.unit.conf.
describe("SmartScalar > compute > comparison labels are timezone-stable", () => {
  const getLabel = ({
    prevDate,
    nextDate,
    dateUnit,
  }: {
    prevDate: string;
    nextDate: string;
    dateUnit: "hour" | "minute";
  }) =>
    computeComparisonStrPreviousValue({
      dateUnitSettings: {
        dateColumn: createMockColumn({ name: "Hour" }),
        dateColumnSettings: {},
        dateUnit,
        queryType: "query",
      },
      prevDate,
      nextDate,
    });

  const cases = [
    {
      description: "condenses the day for an hours-apart comparison",
      prevDate: "2022-12-01T07:00",
      nextDate: "2022-12-01T10:00",
      dateUnit: "hour" as const,
      expected: "vs. 7:00–59 AM",
    },
    {
      description: "condenses year and day when hours are in the same day",
      prevDate: "2019-11-05T04:00:00",
      nextDate: "2019-11-05T10:00:00",
      dateUnit: "hour" as const,
      expected: "vs. 4:00–59 AM",
    },
    {
      description: "condenses year and day when minutes are in the same day",
      prevDate: "2019-11-05T04:00:00",
      nextDate: "2019-11-05T10:00:00",
      dateUnit: "minute" as const,
      expected: "vs. 4:00 AM",
    },
    {
      description: "keeps the day when hours are on different days",
      prevDate: "2019-10-30T04:00:00",
      nextDate: "2019-11-05T10:00:00",
      dateUnit: "hour" as const,
      expected: "vs. Oct 30, 4:00–59 AM",
    },
  ];

  it.each(cases)(
    "$description",
    ({ prevDate, nextDate, dateUnit, expected }) => {
      expect(getLabel({ prevDate, nextDate, dateUnit })).toBe(expected);
    },
  );
});
