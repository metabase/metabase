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
  let parameter4;
  let parameters;
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
    parameter4 = {
      id: 444,
      slug: "qux",
    };
    parameters = [parameter1, parameter2, parameter3, parameter4];

    // typically generated using getParameterValuesByIdFromQueryParams(parameters, queryParams)
    parameterValues = {
      [parameter1.id]: "parameter1 parameterValue",
      [parameter2.id]: "parameter2 parameterValue",
      [parameter3.id]: "parameter3 default value",
    };
  });

  describe("getValuePopulatedParameters", () => {
    it("should return an array of parameter objects with the `value` property set if it exists in the given `parameterValues` id, value map", () => {
      expect(
        getValuePopulatedParameters(parameters, {
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
        parameter3,
        parameter4,
      ]);
    });

    it("should handle there being an undefined or null parameterValues object", () => {
      expect(getValuePopulatedParameters(parameters, undefined)).toEqual(
        parameters,
      );
      expect(getValuePopulatedParameters(parameters, null)).toEqual(parameters);
    });
  });

  describe("getParameterValuesBySlug", () => {
    describe("`preserveDefaultedParameters` === false", () => {
      it("should return a map of defined parameter values keyed by the parameter's slug", () => {
        expect(getParameterValuesBySlug(parameters, parameterValues)).toEqual({
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
        expect(getParameterValuesBySlug(parameters, undefined)).toEqual({});
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

      it("should remove any properties with nil values from the map", () => {
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
          [defaultedParameterWithValue.slug]: defaultedParameterWithValue.value,
        });

        expect(
          getParameterValuesBySlug(
            parameters,
            {},
            { preserveDefaultedParameters: false },
          ),
        ).toEqual(getParameterValuesBySlug(parameters, parameterValues));
      });

      it("should handle nullish parameters", () => {
        expect(getParameterValuesBySlug(undefined, {})).toEqual({});
        expect(getParameterValuesBySlug(null, {})).toEqual({});
      });
    });

    describe("`preserveDefaultedParameters` === true", () => {
      it("should keep defaulted parameters with nil values in the outputted map", () => {
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

        expect(
          getParameterValuesBySlug(parameters, parameterValues, {
            preserveDefaultedParameters: true,
          }),
        ).toEqual({
          [defaultedParameter.slug]: undefined,
          [defaultedParameterWithValue.slug]: defaultedParameterWithValue.value,
        });
      });

      it("should handle nullish parameters", () => {
        expect(
          getParameterValuesBySlug(
            undefined,
            {},
            {
              preserveDefaultedParameters: true,
            },
          ),
        ).toEqual({});

        expect(
          getParameterValuesBySlug(
            null,
            {},
            {
              preserveDefaultedParameters: true,
            },
          ),
        ).toEqual({});
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
});
