import {
  dateParameterValueToMBQL,
  stringParameterValueToMBQL,
  numberParameterValueToMBQL,
  parameterOptionsForField,
  getParametersBySlug,
  mapUIParameterToQueryParameter,
  deriveFieldOperatorFromParameter,
} from "metabase/meta/Parameter";
import MetabaseSettings from "metabase/lib/settings";

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

    it("should return relevantly typed options for location field", () => {
      const locationField = {
        ...field,
        isCity: () => true,
      };
      const availableOptions = parameterOptionsForField(locationField);
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

  describe("mapParameterTypeToFieldType (field-filter-operators-enabled? === true)", () => {
    let fieldFilterOperatorsEnabled;
    beforeAll(() => {
      fieldFilterOperatorsEnabled = MetabaseSettings.get(
        "field-filter-operators-enabled?",
      );
      MetabaseSettings.set("field-filter-operators-enabled?", true);
    });

    afterAll(() => {
      MetabaseSettings.set(
        "field-filter-operators-enabled?",
        fieldFilterOperatorsEnabled,
      );
    });

    it("should return the proper parameter type of location/category parameters", () => {
      expect(mapUIParameterToQueryParameter("category", "foo", "bar")).toEqual({
        type: "string/=",
        value: ["foo"],
        target: "bar",
      });
      expect(
        mapUIParameterToQueryParameter("category/starts-with", ["foo"], "bar"),
      ).toEqual({
        type: "string/starts-with",
        value: ["foo"],
        target: "bar",
      });
      expect(
        mapUIParameterToQueryParameter("location/city", "foo", "bar"),
      ).toEqual({
        type: "string/=",
        value: ["foo"],
        target: "bar",
      });
      expect(
        mapUIParameterToQueryParameter("location/contains", ["foo"], "bar"),
      ).toEqual({
        type: "string/contains",
        value: ["foo"],
        target: "bar",
      });
    });

    it("should return given type when not a location/category option", () => {
      expect(mapUIParameterToQueryParameter("foo/bar", "foo", "bar")).toEqual({
        type: "foo/bar",
        value: "foo",
        target: "bar",
      });
      expect(
        mapUIParameterToQueryParameter("date/single", "foo", "bar"),
      ).toEqual({
        type: "date/single",
        value: "foo",
        target: "bar",
      });
    });

    it("should wrap number values in an array", () => {
      expect(mapUIParameterToQueryParameter("number/=", [123], "bar")).toEqual({
        type: "number/=",
        value: [123],
        target: "bar",
      });

      expect(mapUIParameterToQueryParameter("number/=", 123, "bar")).toEqual({
        type: "number/=",
        value: [123],
        target: "bar",
      });
    });
  });

  describe("mapParameterTypeToFieldType (field-filter-operators-enabled? === false)", () => {
    let fieldFilterOperatorsEnabled;
    beforeAll(() => {
      fieldFilterOperatorsEnabled = MetabaseSettings.get(
        "field-filter-operators-enabled?",
      );
      MetabaseSettings.set("field-filter-operators-enabled?", false);
    });

    afterAll(() => {
      MetabaseSettings.set(
        "field-filter-operators-enabled?",
        fieldFilterOperatorsEnabled,
      );
    });

    it("return given args in a map", () => {
      expect(mapUIParameterToQueryParameter("category", "foo", "bar")).toEqual({
        type: "category",
        value: "foo",
        target: "bar",
      });

      expect(
        mapUIParameterToQueryParameter("location/city", ["foo"], "bar"),
      ).toEqual({
        type: "location/city",
        value: ["foo"],
        target: "bar",
      });
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
