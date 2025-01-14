import * as Lib from "metabase-lib";
import { createQuery } from "metabase-lib/test-helpers";
import {
  applyFilterParameter,
  numberParameterValueToMBQL,
  stringParameterValueToMBQL,
} from "metabase-lib/v1/parameters/utils/mbql";
import { PRODUCTS, PRODUCTS_ID } from "metabase-types/api/mocks/presets";

describe("parameters/utils/mbql", () => {
  describe("stringParameterValueToMBQL", () => {
    describe("when given an array parameter value", () => {
      it("should flatten the array parameter values", () => {
        expect(
          stringParameterValueToMBQL(
            { type: "number/=", value: ["1", "2"] },
            null,
          ),
        ).toEqual(["=", null, "1", "2"]);
      });
    });

    describe("when given a string parameter value", () => {
      it("should return the correct MBQL", () => {
        expect(
          stringParameterValueToMBQL(
            { type: "string/starts-with", value: "1" },
            null,
          ),
        ).toEqual([
          "starts-with",
          null,
          "1",
          {
            "case-sensitive": false,
          },
        ]);
      });
    });

    it("should default the operator to `=`", () => {
      expect(
        stringParameterValueToMBQL(
          { type: "category", value: ["1", "2"] },
          null,
        ),
      ).toEqual(["=", null, "1", "2"]);

      expect(
        stringParameterValueToMBQL(
          { type: "location/city", value: ["1", "2"] },
          null,
        ),
      ).toEqual(["=", null, "1", "2"]);
    });
  });

  describe("numberParameterValueToMBQL", () => {
    describe("when given an array parameter value", () => {
      it("should flatten the array parameter values", () => {
        expect(
          numberParameterValueToMBQL(
            { type: "number/between", value: [1, 2] },
            null,
          ),
        ).toEqual(["between", null, 1, 2]);
      });
    });

    describe("when given a string parameter value", () => {
      it("should parse the parameter value as a float", () => {
        expect(
          numberParameterValueToMBQL({ type: "number/=", value: "1.1" }, null),
        ).toEqual(["=", null, 1.1]);
      });
    });
  });

  describe("fieldFilterParameterToFilter", () => {
    const query = Lib.withDifferentTable(createQuery(), PRODUCTS_ID);
    const stageIndex = -1;

    it("should not modify the query for parameter targets that are not field dimension targets", () => {
      expect(
        applyFilterParameter(query, stageIndex, {
          target: null,
          type: "category",
          value: ["foo"],
        }),
      ).toBe(query);

      expect(
        applyFilterParameter(query, stageIndex, {
          target: [],
          type: "category",
          value: ["foo"],
        }),
      ).toBe(query);

      expect(
        applyFilterParameter(query, stageIndex, {
          target: ["dimension"],
          type: "category",
          value: ["foo"],
        }),
      ).toBe(query);

      expect(
        applyFilterParameter(query, stageIndex, {
          target: ["dimension", ["template-tag", "foo"]],
          type: "category",
          value: ["foo"],
        }),
      ).toBe(query);
    });

    it("should add a filter for a date parameter", () => {
      const newQuery = applyFilterParameter(query, stageIndex, {
        target: ["dimension", ["field", PRODUCTS.CREATED_AT, null]],
        type: "date/single",
        value: "01-01-2020",
      });
      const [filter] = Lib.filters(newQuery, -1);
      expect(Lib.displayInfo(query, stageIndex, filter)).toMatchObject({
        displayName: "Created At is on Jan 1, 2020",
      });
    });

    it("should add a relative date filter with an offset for a date parameter with a correct operator (metabase#49853)", () => {
      const newQuery = applyFilterParameter(query, stageIndex, {
        target: ["dimension", ["field", PRODUCTS.CREATED_AT, null]],
        type: "date/all-options",
        value: "past3months-from-9months",
      });
      const [filter] = Lib.filters(newQuery, stageIndex);
      expect(Lib.expressionParts(query, stageIndex, filter)).toMatchObject({
        operator: "relative-time-interval",
      });
      expect(Lib.displayInfo(query, stageIndex, filter)).toMatchObject({
        displayName:
          "Created At is in the previous 3 months, starting 9 months ago",
      });
    });

    it.each([
      {
        parameter: {
          target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
          type: "string/contains",
          value: "foo",
        },
        expectedDisplayName: "Category contains foo",
      },
      {
        parameter: {
          target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
          type: "string/contains",
          value: ["a", "b"],
        },
        expectedDisplayName: "Category contains 2 selections",
      },
      {
        parameter: {
          target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
          type: "string/starts-with",
          value: ["foo"],
        },
        expectedDisplayName: "Category starts with foo",
      },
    ])(
      "should add a filter for a string parameter",
      ({ parameter, expectedDisplayName }) => {
        const newQuery = applyFilterParameter(query, stageIndex, parameter);
        const [filter] = Lib.filters(newQuery, -1);
        expect(Lib.displayInfo(query, stageIndex, filter)).toMatchObject({
          displayName: expectedDisplayName,
        });
      },
    );

    it("should adda filter for a category parameter", () => {
      const newQuery = applyFilterParameter(query, stageIndex, {
        target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
        type: "category",
        value: ["foo", "bar"],
      });
      const [filter] = Lib.filters(newQuery, -1);
      expect(Lib.displayInfo(query, stageIndex, filter)).toMatchObject({
        displayName: "Category is 2 selections",
      });
    });

    it("should return mbql filter for number parameter", () => {
      const valueFilterQuery = applyFilterParameter(query, stageIndex, {
        target: ["dimension", ["field", PRODUCTS.RATING, null]],
        type: "number/=",
        value: 111,
      });
      const [valueFilter] = Lib.filters(valueFilterQuery, -1);
      expect(Lib.displayInfo(query, stageIndex, valueFilter)).toMatchObject({
        displayName: "Rating is equal to 111",
      });

      const arrayFilterQuery = applyFilterParameter(query, stageIndex, {
        target: ["dimension", ["field", PRODUCTS.RATING, null]],
        type: "number/=",
        value: [111],
      });
      const [arrayFilter] = Lib.filters(arrayFilterQuery, -1);
      expect(Lib.displayInfo(query, stageIndex, arrayFilter)).toMatchObject({
        displayName: "Rating is equal to 111",
      });

      const betweenFilterQuery = applyFilterParameter(query, stageIndex, {
        target: ["dimension", ["field", PRODUCTS.RATING, null]],
        type: "number/between",
        value: [1, 100],
      });
      const [betweenFilter] = Lib.filters(betweenFilterQuery, -1);
      expect(Lib.displayInfo(query, stageIndex, betweenFilter)).toMatchObject({
        displayName: "Rating is between 1 and 100",
      });
    });
  });
});
