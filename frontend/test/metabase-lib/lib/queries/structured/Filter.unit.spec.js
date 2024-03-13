import { createMockMetadata } from "__support__/metadata";
import Filter from "metabase-lib/v1/queries/structured/Filter";
import { createMockSegment } from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
  segments: [createMockSegment({ name: "Expensive Things" })],
});

const ordersTable = metadata.table(ORDERS_ID);

const query = ordersTable.legacyQuery({ useStructuredQuery: true });

function filter(mbql) {
  return new Filter(mbql, 0, query);
}

const dateType = temporalUnit => ({
  "base-type": "type/DateTime",
  "temporal-unit": temporalUnit,
});

describe("Filter", () => {
  describe("displayName", () => {
    it("should return the correct string for an = filter", () => {
      expect(
        filter(["=", ["field", ORDERS.TOTAL, null], 42]).displayName(),
      ).toEqual("Total is equal to 42");
    });
    it("should return the correct string for a segment filter", () => {
      expect(filter(["segment", 1]).displayName()).toEqual("Expensive Things");
    });
    describe("date labels", () => {
      it("should display is-week filter as a day range", () => {
        expect(
          filter([
            "=",
            ["field", ORDERS.CREATED_AT, dateType("week")],
            "2026-10-04",
          ]).displayName(),
        ).toEqual("Created At is October 4–10, 2026");
      });
      it("should display between dates filter with undefined temporal unit as day range", () => {
        expect(
          filter([
            "between",
            ["field", ORDERS.CREATED_AT, dateType()],
            "2026-10-04",
            "2026-10-11",
          ]).displayName(),
        ).toEqual("Created At is October 4–11, 2026");
      });
      it("should display between-weeks filter as day range", () => {
        expect(
          filter([
            "between",
            ["field", ORDERS.CREATED_AT, dateType("week")],
            "2026-10-04",
            "2026-10-11",
          ]).displayName(),
        ).toEqual("Created At is October 4–17, 2026");
      });
      it("should display between-minutes filter", () => {
        expect(
          filter([
            "between",
            ["field", ORDERS.CREATED_AT, dateType("minute")],
            "2026-10-04T10:20",
            "2026-10-04T16:30",
          ]).displayName(),
        ).toEqual("Created At is October 4, 2026, 10:20 AM – 4:30 PM");
        expect(
          filter([
            "between",
            ["field", ORDERS.CREATED_AT, dateType("minute")],
            "2026-10-04T10:20",
            "2026-10-11T16:30",
          ]).displayName(),
        ).toEqual(
          "Created At is October 4, 10:20 AM – October 11, 2026, 4:30 PM",
        );
      });
      it("should display slice filters with enough context for understanding them", () => {
        expect(
          filter([
            "=",
            ["field", ORDERS.CREATED_AT, dateType("minute-of-hour")],
            "2023-07-03T18:31:00",
          ]).displayName(),
        ).toEqual("Created At is minute :31");
        expect(
          filter([
            "=",
            ["field", ORDERS.CREATED_AT, dateType("hour-of-day")],
            "2023-07-03T10:00:00",
          ]).displayName(),
        ).toEqual("Created At is 10:00–59 AM");
        expect(
          filter([
            "=",
            ["field", ORDERS.CREATED_AT, dateType("day-of-month")],
            "2016-01-17",
          ]).displayName(),
        ).toEqual("Created At is 17th day of the month");
        expect(
          filter([
            "=",
            ["field", ORDERS.CREATED_AT, dateType("day-of-year")],
            "2016-07-19",
          ]).displayName(),
        ).toEqual("Created At is 201st day of the year");
        expect(
          filter([
            "=",
            ["field", ORDERS.CREATED_AT, dateType("week-of-year")],
            "2023-07-02",
          ]).displayName(),
        ).toEqual("Created At is 27th week of the year");
      });
    });
  });
  describe("isValid", () => {
    describe("with a field filter", () => {
      it("should return true for a field that exists", () => {
        expect(filter(["=", ["field", ORDERS.TOTAL, null], 42]).isValid()).toBe(
          true,
        );
      });
      it("should return false for a field that doesn't exists", () => {
        expect(filter(["=", ["field", 12341234, null], 42]).isValid()).toBe(
          false,
        );
      });
      it("should return false with a null operator", () => {
        expect(
          filter([null, ["field", ORDERS.TOTAL, null], 42]).isValid(),
        ).toBe(false);
      });
      it("should return true for a filter with an expression for the field", () => {
        expect(
          filter(["=", ["/", ["field", 12341234, null], 43], 42]).isValid(),
        ).toBe(true);
      });
    });
  });
  describe("operator", () => {
    it("should return the correct FilterOperator", () => {
      expect(
        filter(["=", ["field", ORDERS.TOTAL, null], 42]).operator().name,
      ).toBe("=");
    });
  });
  describe("setDimension", () => {
    it("should set the dimension for existing filter clause", () => {
      expect(
        filter(["=", ["field", ORDERS.SUBTOTAL, null], 42]).setDimension(
          ["field", ORDERS.TOTAL, null],
          {
            useDefaultOperator: true,
          },
        ),
      ).toEqual(["=", ["field", ORDERS.TOTAL, null], 42]);
    });
    it("should set the dimension for new filter clause", () => {
      expect(filter([]).setDimension(["field", ORDERS.TOTAL, null])).toEqual([
        null,
        ["field", ORDERS.TOTAL, null],
      ]);
    });
    it("should set the dimension and default operator for empty filter clauses", () => {
      expect(
        filter([]).setDimension(["field", ORDERS.TOTAL, null], {
          useDefaultOperator: true,
        }),
      ).toEqual(["=", ["field", ORDERS.TOTAL, null], undefined]);
    });
    it("should set the dimension correctly when changing from segment", () => {
      expect(
        filter(["segment", 1]).setDimension(["field", ORDERS.TOTAL, null]),
      ).toEqual([null, ["field", ORDERS.TOTAL, null]]);
    });
  });

  const CASES = [
    ["isStandard", ["=", ["field", 1, null], 42]],
    ["isStandard", [null, ["field", 1, null]]], // assume null operator is standard
    ["isStandard", ["between", ["field", 1, null], 1, 4]],
    ["isStandard", ["contains", ["field", 1, null], "river"]],
    ["isStandard", ["is-empty", ["field", 1, null]]],
    ["isStandard", ["starts-with", ["field", 1, null], "X"]],
    ["isStandard", ["ends-with", ["field", 1, null], "Y"]],
    ["isStandard", ["=", ["field", 1, null], undefined]], // standard but invalid
    ["isStandard", ["between", ["field", 1, null], undefined, 4]], // standard but invalid
    ["isSegment", ["segment", 1]],
    ["isCustom", ["or", ["=", ["field", 1, null], 42]]],
    ["isCustom", ["=", ["field", 1, null], ["field", 2, null]]],
    ["isCustom", ["between", ["field", 1, null], 1, ["field", 2, null]]],
    ["isCustom", ["between", ["field", 1, null], ["field", 2, null], 3]],
    ["isCustom", ["between", ["field", 1, null], ["field", 7], ["field", 9]]],
    ["isCustom", ["contains", ["field", 8], ["upper", "cat"]]],
    ["isCustom", ["starts-with", ["field", 1, null], ["lower", "X"]]],
    ["isCustom", ["ends-with", ["field", 1, null], ["trim", "Y"]]],
  ];
  for (const method of ["isStandard", "isSegment", "isCustom"]) {
    describe(method, () => {
      for (const [method_, mbql] of CASES) {
        const expected = method_ === method;
        it(`should return ${expected} for ${JSON.stringify(mbql)}`, () => {
          expect(filter(mbql)[method]()).toEqual(expected);
        });
      }
    });
  }
});
