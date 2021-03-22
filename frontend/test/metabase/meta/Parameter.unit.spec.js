import {
  dateParameterValueToMBQL,
  stringParameterValueToMBQL,
  numberParameterValueToMBQL,
  parameterOptionsForField,
  getParametersBySlug,
  mapUITypeToParameterType,
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
    };
    it("should relevantly typed options for date field", () => {
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

    it("should relevantly typed options for location field", () => {
      const countryField = {
        ...field,
        isCountry: () => true,
      };
      const availableOptions = parameterOptionsForField(countryField);
      expect(
        availableOptions.length > 0 &&
          availableOptions.every(option => option.type.startsWith("location")),
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

  describe("mapParameterTypeToFieldType", () => {
    it("should return the proper parameter type of location/category parameters", () => {
      expect(mapUITypeToParameterType({ type: "category" })).toEqual(
        "string/=",
      );
      expect(
        mapUITypeToParameterType({ type: "category/starts-with" }),
      ).toEqual("string/starts-with");
      expect(mapUITypeToParameterType({ type: "location/city" })).toEqual(
        "string/=",
      );
      expect(mapUITypeToParameterType({ type: "location/contains" })).toEqual(
        "string/contains",
      );
    });

    it("should return given type when not a location/category option", () => {
      expect(mapUITypeToParameterType({ type: "foo/bar" })).toEqual("foo/bar");
      expect(mapUITypeToParameterType({ type: "date/single" })).toEqual(
        "date/single",
      );
      expect(mapUITypeToParameterType({ type: "number/=" })).toEqual(
        "number/=",
      );
    });
  });

  describe("deriveFieldOperatorFromParameter", () => {
    describe("when parameter is associated with an operator", () => {
      it("should return relevant operator object", () => {
        const operator1 = deriveFieldOperatorFromParameter({
          type: "location/city",
        });
        const operator2 = deriveFieldOperatorFromParameter({
          type: "category/contains",
        });
        const operator3 = deriveFieldOperatorFromParameter({
          type: "number/between",
        });
        expect(operator1.name).toEqual("=");
        expect(operator2.name).toEqual("contains");
        expect(operator3.name).toEqual("between");
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
