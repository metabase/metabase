import {
  dateParameterValueToMBQL,
  stringParameterValueToMBQL,
  numberParameterValueToMBQL,
  parameterOptionsForField,
  getParametersBySlug,
  normalizeParameterValue,
  deriveFieldOperatorFromParameter,
} from "metabase/meta/Parameter";

describe("metabase/meta/Parameter", () => {
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
            { type: "category/=", value: ["1", "2"] },
            null,
          ),
        ).toEqual(["=", null, "1", "2"]);
      });
    });

    describe("when given a string parameter value", () => {
      it("should return the correct MBQL", () => {
        expect(
          stringParameterValueToMBQL(
            { type: "category/starts-with", value: "1" },
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

  describe("parameterOptionsForField", () => {
    const field = {
      isDate: () => false,
      isID: () => false,
      isCategory: () => false,
      isCity: () => false,
      isState: () => false,
      isZipCode: () => false,
      isCountry: () => false,
      isNumber: () => false,
      isString: () => false,
      isLocation: () => false,
    };
    it("should return relevantly typed options for date field", () => {
      const dateField = {
        ...field,
        isDate: () => true,
      };
      const availableOptions = parameterOptionsForField(dateField);
      expect(
        availableOptions.length > 0 &&
          availableOptions.every(option => option.type.startsWith("date")),
      ).toBe(true);
    });

    it("should return relevantly typed options for id field", () => {
      const idField = {
        ...field,
        isID: () => true,
      };
      const availableOptions = parameterOptionsForField(idField);
      expect(
        availableOptions.length > 0 &&
          availableOptions.every(option => option.type.startsWith("id")),
      ).toBe(true);
    });
  });

  describe("getParameterBySlug", () => {
    it("should return an object mapping slug to parameter value", () => {
      const parameters = [
        { id: "foo", slug: "bar" },
        { id: "aaa", slug: "bbb" },
        { id: "cat", slug: "dog" },
      ];
      const parameterValuesById = {
        foo: 123,
        aaa: "ccc",
        something: true,
      };
      expect(getParametersBySlug(parameters, parameterValuesById)).toEqual({
        bar: 123,
        bbb: "ccc",
      });
    });
  });

  describe("normalizeParameterValue", () => {
    it("should return same value for location/category parameters", () => {
      expect(normalizeParameterValue("category", "foo")).toEqual("foo");
      expect(normalizeParameterValue("location/city", "bar")).toEqual("bar");
    });

    it("should return same value for date parameters", () => {
      expect(normalizeParameterValue("date/single", "foo")).toEqual("foo");
    });

    it("should return normalized value for string parameters", () => {
      expect(normalizeParameterValue("string/contains", "foo")).toEqual([
        "foo",
      ]);
      expect(normalizeParameterValue("string/contains")).toEqual([]);
    });

    it("should return normalized value for number parameters", () => {
      expect(normalizeParameterValue("number/=", 0)).toEqual([0]);
      expect(normalizeParameterValue("number/=", null)).toEqual([]);
    });
  });

  describe("deriveFieldOperatorFromParameter", () => {
    describe("when parameter is associated with an operator", () => {
      it("should return relevant operator object", () => {
        const operator2 = deriveFieldOperatorFromParameter({
          type: "string/contains",
        });
        const operator3 = deriveFieldOperatorFromParameter({
          type: "number/between",
        });
        expect(operator2.name).toEqual("contains");
        expect(operator3.name).toEqual("between");
      });
    });

    describe("when parameter is location/category", () => {
      it("should map to an = operator", () => {
        expect(
          deriveFieldOperatorFromParameter({
            type: "location/city",
          }).name,
        ).toBe("=");

        expect(
          deriveFieldOperatorFromParameter({
            type: "category",
          }).name,
        ).toBe("=");
      });
    });

    describe("when parameter is NOT associated with an operator", () => {
      it("should return undefined", () => {
        expect(deriveFieldOperatorFromParameter({ type: "date/single" })).toBe(
          undefined,
        );
      });
    });
  });
});
