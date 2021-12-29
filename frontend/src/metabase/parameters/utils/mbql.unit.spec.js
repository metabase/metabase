import {
  dateParameterValueToMBQL,
  stringParameterValueToMBQL,
  numberParameterValueToMBQL,
  parameterToMBQLFilter,
} from "./mbql";
import { metadata, PRODUCTS } from "__support__/sample_dataset_fixture";

describe("parameters/utils/mbql", () => {
  describe("dateParameterValueToMBQL", () => {
    it("should parse past30days", () => {
      expect(dateParameterValueToMBQL("past30days", null)).toEqual([
        "time-interval",
        null,
        -30,
        "day",
      ]);
    });
    it("should parse past30days~", () => {
      expect(dateParameterValueToMBQL("past30days~", null)).toEqual([
        "time-interval",
        null,
        -30,
        "day",
        { "include-current": true },
      ]);
    });
    it("should parse next2years", () => {
      expect(dateParameterValueToMBQL("next2years", null)).toEqual([
        "time-interval",
        null,
        2,
        "year",
      ]);
    });
    it("should parse next2years~", () => {
      expect(dateParameterValueToMBQL("next2years~", null)).toEqual([
        "time-interval",
        null,
        2,
        "year",
        { "include-current": true },
      ]);
    });
    it("should parse thisday", () => {
      expect(dateParameterValueToMBQL("thisday", null)).toEqual([
        "time-interval",
        null,
        "current",
        "day",
      ]);
    });
    it("should parse ~2017-05-01", () => {
      expect(dateParameterValueToMBQL("~2017-05-01", null)).toEqual([
        "<",
        null,
        "2017-05-01",
      ]);
    });
    it("should parse 2017-05-01~", () => {
      expect(dateParameterValueToMBQL("2017-05-01~", null)).toEqual([
        ">",
        null,
        "2017-05-01",
      ]);
    });
    it("should parse 2017-05", () => {
      expect(dateParameterValueToMBQL("2017-05", null)).toEqual([
        "=",
        ["field", null, { "temporal-unit": "month" }],
        "2017-05-01",
      ]);
    });
    it("should parse Q1-2017", () => {
      expect(dateParameterValueToMBQL("Q1-2017", null)).toEqual([
        "=",
        ["field", null, { "temporal-unit": "quarter" }],
        "2017-01-01",
      ]);
    });
    it("should parse 2017-05-01", () => {
      expect(dateParameterValueToMBQL("2017-05-01", null)).toEqual([
        "=",
        null,
        "2017-05-01",
      ]);
    });
    it("should parse 2017-05-01~2017-05-02", () => {
      expect(dateParameterValueToMBQL("2017-05-01~2017-05-02", null)).toEqual([
        "between",
        null,
        "2017-05-01",
        "2017-05-02",
      ]);
    });
  });

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
        ).toEqual(["starts-with", null, "1"]);
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

  describe("parameterToMBQLFilter", () => {
    it("should return null for parameter targets that are not field dimension targets", () => {
      expect(
        parameterToMBQLFilter({
          target: null,
          type: "category",
          value: ["foo"],
        }),
      ).toBe(null);

      expect(
        parameterToMBQLFilter({ target: [], type: "category", value: ["foo"] }),
      ).toBe(null);

      expect(
        parameterToMBQLFilter({
          target: ["dimension"],
          type: "category",
          value: ["foo"],
        }),
      ).toBe(null);

      expect(
        parameterToMBQLFilter({
          target: ["dimension", ["template-tag", "foo"]],
          type: "category",
          value: ["foo"],
        }),
      ).toBe(null);
    });

    it("should return mbql filter for date parameter", () => {
      expect(
        parameterToMBQLFilter(
          {
            target: ["dimension", ["field", PRODUCTS.CREATED_AT.id, null]],
            type: "date/single",
            value: "01-01-2020",
          },
          metadata,
        ),
      ).toEqual(["=", ["field", PRODUCTS.CREATED_AT.id, null], "01-01-2020"]);
    });

    it("should return mbql filter for string parameter", () => {
      expect(
        parameterToMBQLFilter(
          {
            target: ["dimension", ["field", PRODUCTS.CATEGORY.id, null]],
            type: "string/starts-with",
            value: "foo",
          },
          metadata,
        ),
      ).toEqual(["starts-with", ["field", PRODUCTS.CATEGORY.id, null], "foo"]);

      expect(
        parameterToMBQLFilter(
          {
            target: ["dimension", ["field", PRODUCTS.CATEGORY.id, null]],
            type: "string/starts-with",
            value: ["foo"],
          },
          metadata,
        ),
      ).toEqual(["starts-with", ["field", PRODUCTS.CATEGORY.id, null], "foo"]);
    });

    it("should return mbql filter for category parameter", () => {
      expect(
        parameterToMBQLFilter(
          {
            target: ["dimension", ["field", PRODUCTS.CATEGORY.id, null]],
            type: "category",
            value: ["foo", "bar"],
          },
          metadata,
        ),
      ).toEqual(["=", ["field", PRODUCTS.CATEGORY.id, null], "foo", "bar"]);
    });

    it("should return mbql filter for number parameter", () => {
      expect(
        parameterToMBQLFilter(
          {
            target: ["dimension", ["field", PRODUCTS.RATING.id, null]],
            type: "number/=",
            value: [111],
          },
          metadata,
        ),
      ).toEqual(["=", ["field", PRODUCTS.RATING.id, null], 111]);

      expect(
        parameterToMBQLFilter(
          {
            target: ["dimension", ["field", PRODUCTS.RATING.id, null]],
            type: "number/=",
            value: 111,
          },
          metadata,
        ),
      ).toEqual(["=", ["field", PRODUCTS.RATING.id, null], 111]);

      expect(
        parameterToMBQLFilter(
          {
            target: ["dimension", ["field", PRODUCTS.RATING.id, null]],
            type: "number/between",
            value: [1, 100],
          },
          metadata,
        ),
      ).toEqual(["between", ["field", PRODUCTS.RATING.id, null], 1, 100]);
    });
  });
});
