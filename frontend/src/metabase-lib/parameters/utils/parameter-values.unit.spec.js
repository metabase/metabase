import {
  getValuePopulatedParameters,
  getParameterValuesBySlug,
  normalizeParameterValue,
} from "metabase-lib/parameters/utils/parameter-values";

describe("parameters/utils/parameter-values", () => {
  let field1;
  let field2;
  let field3;
  let field4;
  let parameter1;
  let parameter2;
  let parameter3;
  let parameterValues;

  beforeEach(() => {
    field1 = {
      id: 1,
      table_id: 1,
      isNumeric: () => false,
      isDate: () => false,
      isBoolean: () => false,
    };
    field2 = {
      id: 2,
      table_id: 1,
      isNumeric: () => false,
      isDate: () => false,
      isBoolean: () => false,
    };
    field3 = {
      id: 3,
      table_id: 1,
      isNumeric: () => false,
      isDate: () => false,
      isBoolean: () => false,
    };
    field4 = {
      id: 4,
      table_id: 1,
      isNumeric: () => false,
      isDate: () => false,
      isBoolean: () => false,
    };

    parameter1 = {
      id: 111,
      slug: "foo",
      fields: [field1, field4],
    };
    parameter2 = {
      id: 222,
      slug: "bar",
      default: "parameter2 default value",
      fields: [field2],
    };
    parameter3 = {
      id: 333,
      slug: "baz",
      default: "parameter3 default value",
      fields: [field3],
    };

    // typically generated using getParameterValuesByIdFromQueryParams(parameters, queryParams)
    parameterValues = {
      [parameter1.id]: "parameter1 parameterValue",
      [parameter2.id]: "parameter2 parameterValue",
      [parameter3.id]: "parameter3 default value",
    };
  });

  describe("getValuePopulatedParameters", () => {
    it("should return an array of parameter objects with the `value` property set if it exists in the given `parameterValues` id, value map, and null if it doesn't exist", () => {
      expect(
        getValuePopulatedParameters([parameter1, parameter2], {
          [parameter1.id]: "parameter1 value",
          [parameter2.id]: "parameter2 value",
        }),
      ).toEqual([
        {
          ...parameter1,
          value: "parameter1 value",
        },
        {
          ...parameter2,
          value: "parameter2 value",
        },
      ]);
    });

    it("should return null value if the parameter doesn't exist in the parameterValues arg", () => {
      expect(getValuePopulatedParameters([parameter1], {})).toEqual([
        { ...parameter1, value: null },
      ]);
    });

    it("should handle there being an undefined or null parameterValues object", () => {
      const parametersWithNulls = [
        {
          ...parameter1,
          value: null,
        },
        {
          ...parameter2,
          value: null,
        },
      ];
      expect(getValuePopulatedParameters([parameter1, parameter2])).toEqual(
        parametersWithNulls,
      );
      expect(
        getValuePopulatedParameters([parameter1, parameter2], null),
      ).toEqual(parametersWithNulls);
    });
  });

  describe("getParameterValuesBySlug", () => {
    it("should return a map of defined parameter values keyed by the parameter's slug", () => {
      expect(
        getParameterValuesBySlug(
          [parameter1, parameter2, parameter3],
          parameterValues,
        ),
      ).toEqual({
        [parameter1.slug]: "parameter1 parameterValue",
        [parameter2.slug]: "parameter2 parameterValue",
        [parameter3.slug]: "parameter3 default value",
      });
    });

    it("should prioritize values found on the parameter object over the parameterValues map", () => {
      const valuePopulatedParameter1 = {
        ...parameter1,
        value: "parameter1 value prop",
      };
      const parameters = [valuePopulatedParameter1, parameter2];

      expect(getParameterValuesBySlug(parameters, parameterValues)).toEqual({
        [parameter1.slug]: "parameter1 value prop", // was set on parameter object
        [parameter2.slug]: "parameter2 parameterValue", // was NOT set on parameter object, found on parameterValues
      });
    });

    it("should handle an undefined parameterValues map", () => {
      expect(getParameterValuesBySlug([parameter1])).toEqual({
        [parameter1.slug]: null,
      });
      expect(
        getParameterValuesBySlug([
          {
            ...parameter1,
            value: "parameter1 value prop",
          },
        ]),
      ).toEqual({
        [parameter1.slug]: "parameter1 value prop",
      });
    });

    it("should not remove any properties with nil values from the map", () => {
      const defaultedParameter = {
        id: 999,
        slug: "abc",
        default: 123,
      };

      const defaultedParameterWithValue = {
        id: 888,
        slug: "def",
        default: 456,
        value: 789,
      };

      const parameters = [defaultedParameter, defaultedParameterWithValue];

      expect(getParameterValuesBySlug(parameters, {})).toEqual({
        [defaultedParameter.slug]: null,
        [defaultedParameterWithValue.slug]: defaultedParameterWithValue.value,
      });

      expect(getParameterValuesBySlug(parameters, {})).toEqual(
        getParameterValuesBySlug(parameters, parameterValues),
      );
    });

    it("should handle nullish parameters", () => {
      expect(getParameterValuesBySlug(undefined, {})).toEqual({});
      expect(getParameterValuesBySlug(null, {})).toEqual({});
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
      expect(normalizeParameterValue("string/contains", null)).toEqual(null);
    });

    it("should return normalized value for number parameters", () => {
      expect(normalizeParameterValue("number/=", 0)).toEqual([0]);
      expect(normalizeParameterValue("number/=", null)).toEqual(null);
    });
  });
});
