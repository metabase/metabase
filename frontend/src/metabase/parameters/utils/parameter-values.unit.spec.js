import {
  getValuePopulatedParameters,
  getParameterValueFromQueryParams,
  getParameterValuesByIdFromQueryParams,
  getParameterValuesBySlug,
  normalizeParameterValue,
} from "./parameter-values";

describe("parameters/utils/parameter-values", () => {
  let field1;
  let field2;
  let field3;
  let field4;
  let metadata;
  let parameter1;
  let parameter2;
  let parameter3;
  let parameter4;
  let parameters;
  let parameterValues;
  let queryParams;
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

    metadata = {
      field(id) {
        return this.fields[id];
      },
      fields: {
        [field1.id]: field1,
        [field2.id]: field2,
        [field3.id]: field3,
        [field4.id]: field4,
      },
      table(id) {
        return this.tables[id];
      },
      tables: {
        1: {
          id: 1,
        },
      },
    };

    // found in queryParams and not defaulted
    parameter1 = {
      id: 111,
      slug: "foo",
      fields: [field1, field4],
    };
    // found in queryParams and defaulted
    parameter2 = {
      id: 222,
      slug: "bar",
      default: "parameter2 default value",
      fields: [field2],
    };
    // not found in queryParams and defaulted
    parameter3 = {
      id: 333,
      slug: "baz",
      default: "parameter3 default value",
      fields: [field3],
    };
    // not found in queryParams and not defaulted
    parameter4 = {
      id: 444,
      slug: "qux",
    };
    parameters = [parameter1, parameter2, parameter3, parameter4];
    queryParams = {
      foo: "parameter1 queryParam value",
      bar: "parameter2 queryParam value",
      valueNotFoundInParameters: "nonexistent parameter queryParam value",
    };

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

  describe("getParameterValueFromQueryParams", () => {
    it("should return undefined when given an undefined queryParams arg", () => {
      expect(
        getParameterValueFromQueryParams(parameter1, undefined, metadata),
      ).toBe(undefined);
    });

    it("should return the parameter's default value when given an undefined queryParams arg", () => {
      expect(
        getParameterValueFromQueryParams(parameter2, undefined, metadata),
      ).toBe("parameter2 default value");
    });

    it("should return the parameter's default value when the parameter value is not found in queryParams", () => {
      expect(
        getParameterValueFromQueryParams(parameter3, queryParams, metadata),
      ).toBe("parameter3 default value");
    });

    it("should return the parameter value found in the queryParams object", () => {
      expect(
        getParameterValueFromQueryParams(parameter1, queryParams, metadata),
      ).toEqual(["parameter1 queryParam value"]);
    });

    it("should ignore the parameter's default value when the parameter value is found in queryParams", () => {
      expect(
        getParameterValueFromQueryParams(parameter2, queryParams, metadata),
      ).toEqual(["parameter2 queryParam value"]);
    });

    it("should return an empty string as the value for a defaulted parameter because we handle that special case elsewhere", () => {
      expect(
        getParameterValueFromQueryParams(
          parameter2,
          {
            [parameter2.slug]: "",
          },
          metadata,
        ),
      ).toBe("");
    });

    it("should parse the parameter value as a float if all associated fields are numeric and not dates", () => {
      field1.isNumeric = () => true;
      field1.isDate = () => false;

      field4.isNumeric = () => true;
      field4.isDate = () => false;

      expect(
        getParameterValueFromQueryParams(
          parameter1,
          {
            [parameter1.slug]: "123.456",
          },
          metadata,
        ),
      ).toEqual([123.456]);

      expect(
        getParameterValueFromQueryParams(
          parameter1,
          {
            [parameter1.slug]: "",
          },
          metadata,
        ),
      ).toBe("");
    });

    it("should parse the parameter value as a float when it is a number parameter without fields", () => {
      const numberParameter = {
        id: 111,
        slug: "numberParameter",
        type: "number/=",
      };
      expect(
        getParameterValueFromQueryParams(
          numberParameter,
          {
            [numberParameter.slug]: "123.456",
          },
          metadata,
        ),
      ).toEqual([123.456]);
    });

    it("should not parse numeric values that are dates as floats", () => {
      field1.isNumeric = () => true;
      field1.isDate = () => true;

      field4.isNumeric = () => true;
      field4.isDate = () => false;

      expect(
        getParameterValueFromQueryParams(
          parameter1,
          {
            [parameter1.slug]: "123.456",
          },
          metadata,
        ),
      ).toEqual(["123.456"]);
    });

    it("should parse a value of 'true' or 'false' as a boolean if all associated fields are booleans", () => {
      field1.isBoolean = () => true;
      field4.isBoolean = () => true;

      expect(
        getParameterValueFromQueryParams(
          parameter1,
          {
            [parameter1.slug]: "true",
          },
          metadata,
        ),
      ).toEqual([true]);

      expect(
        getParameterValueFromQueryParams(
          parameter1,
          {
            [parameter1.slug]: "false",
          },
          metadata,
        ),
      ).toEqual([false]);

      expect(
        getParameterValueFromQueryParams(
          parameter1,
          {
            [parameter1.slug]: "",
          },
          metadata,
        ),
      ).toBe("");

      expect(
        getParameterValueFromQueryParams(
          parameter1,
          {
            [parameter1.slug]: "foo",
          },
          metadata,
        ),
      ).toEqual(["foo"]);
    });

    it("should not normalize date parameters", () => {
      parameter1.type = "date/foo";
      parameter1.hasVariableTemplateTagTarget = false;

      expect(
        getParameterValueFromQueryParams(
          parameter1,
          {
            [parameter1.slug]: "123",
          },
          metadata,
        ),
      ).toEqual("123");
    });

    it("should not normalize parameters mapped to non-field targets", () => {
      parameter1.type = "category";
      parameter1.hasVariableTemplateTagTarget = true;

      expect(
        getParameterValueFromQueryParams(
          parameter1,
          {
            [parameter1.slug]: "foo",
          },
          metadata,
        ),
      ).toEqual(["foo"]);
    });

    it("should not normalize empty string parameter values", () => {
      parameter1.type = "category";
      parameter1.hasVariableTemplateTagTarget = false;

      expect(
        getParameterValueFromQueryParams(
          parameter1,
          {
            [parameter1.slug]: "",
          },
          metadata,
        ),
      ).toBe("");
    });

    it("should normalize non-date parameters mapped only to field targets", () => {
      parameter1.type = "category";
      parameter1.hasVariableTemplateTagTarget = false;

      expect(
        getParameterValueFromQueryParams(
          parameter1,
          {
            [parameter1.slug]: "foo",
          },
          metadata,
        ),
      ).toEqual(["foo"]);

      expect(
        getParameterValueFromQueryParams(
          parameter1,
          {
            [parameter1.slug]: ["foo", "bar"],
          },
          metadata,
        ),
      ).toEqual(["foo", "bar"]);
    });

    it("should be able to get the underlying field of a parameter tied to a dimension", () => {
      field3.isBoolean = () => true;

      expect(
        getParameterValueFromQueryParams(
          parameter3,
          {
            [parameter3.slug]: "true",
          },
          metadata,
        ),
      ).toEqual([true]);
    });

    it("should not try to parse parameters without fields", () => {
      expect(
        getParameterValueFromQueryParams(
          parameter4,
          {
            [parameter4.slug]: "true",
          },
          metadata,
        ),
      ).toEqual(["true"]);
    });

    it("should not try to parse default values", () => {
      field2.isNumeric = () => true;
      field2.isDate = () => false;

      expect(
        getParameterValueFromQueryParams(
          parameter2,
          {
            [parameter2.slug]: "parameter2 default value",
          },
          metadata,
        ),
      ).toEqual([NaN]);

      expect(getParameterValueFromQueryParams(parameter2, {}, metadata)).toBe(
        "parameter2 default value",
      );
    });
  });

  describe("getParameterValuesByIdFromQueryParams", () => {
    describe("`forcefullyUnsetDefaultedParametersWithEmptyStringValue` === false", () => {
      it("should generate a map of parameter values found in the queryParams or with default values", () => {
        expect(
          getParameterValuesByIdFromQueryParams(
            parameters,
            queryParams,
            metadata,
          ),
        ).toEqual({
          [parameter1.id]: ["parameter1 queryParam value"],
          [parameter2.id]: ["parameter2 queryParam value"],
          [parameter3.id]: "parameter3 default value",
        });
      });

      it("should handle an undefined queryParams", () => {
        expect(
          getParameterValuesByIdFromQueryParams(
            parameters,
            undefined,
            metadata,
          ),
        ).toEqual({
          [parameter2.id]: "parameter2 default value",
          [parameter3.id]: "parameter3 default value",
        });
      });

      it("should treat special cased defaulted parameters + empty string value as NIL and use the defaulted value", () => {
        const queryParamsWithSpecialCase = {
          ...queryParams,
          [parameter1.slug]: "", // this parameter has no default
          [parameter2.slug]: "", // this parameter has a default
        };

        expect(
          getParameterValuesByIdFromQueryParams(
            parameters,
            queryParamsWithSpecialCase,
            metadata,
            { forcefullyUnsetDefaultedParametersWithEmptyStringValue: false },
          ),
        ).toEqual({
          [parameter2.id]: "parameter2 default value",
          [parameter3.id]: "parameter3 default value",
        });

        expect(
          getParameterValuesByIdFromQueryParams(
            parameters,
            queryParamsWithSpecialCase,
            metadata,
          ),
        ).toEqual(
          getParameterValuesByIdFromQueryParams(
            parameters,
            queryParamsWithSpecialCase,
            metadata,
            { forcefullyUnsetDefaultedParametersWithEmptyStringValue: false },
          ),
        );
      });

      it("should not filter out falsy non-nil values", () => {
        field1.isNumeric = () => true;
        field4.isNumeric = () => true;

        field3.isBoolean = () => true;

        expect(
          getParameterValuesByIdFromQueryParams(
            parameters,
            {
              [parameter1.slug]: "0",
              [parameter2.slug]: "parameter2 foo value",
              [parameter3.slug]: "false",
            },
            metadata,
            { forcefullyUnsetDefaultedParametersWithEmptyStringValue: false },
          ),
        ).toEqual({
          [parameter1.id]: [0],
          [parameter2.id]: ["parameter2 foo value"],
          [parameter3.id]: [false],
        });
      });
    });

    describe("`forcefullyUnsetDefaultedParametersWithEmptyStringValue` === true", () => {
      it("should remove defaulted parameters set to '' from the output", () => {
        const queryParamsWithSpecialCase = {
          ...queryParams,
          [parameter1.slug]: "", // this parameter has no default
          [parameter2.slug]: "", // this parameter has a default
        };

        expect(
          getParameterValuesByIdFromQueryParams(
            parameters,
            queryParamsWithSpecialCase,
            metadata,
            { forcefullyUnsetDefaultedParametersWithEmptyStringValue: true },
          ),
        ).toEqual({
          [parameter3.id]: "parameter3 default value",
        });
      });
    });

    it("should not filter out falsy non-nil, non-empty-string values", () => {
      field1.isNumeric = () => true;
      field4.isNumeric = () => true;

      field3.isBoolean = () => true;

      expect(
        getParameterValuesByIdFromQueryParams(
          parameters,
          {
            [parameter1.slug]: "0",
            [parameter2.slug]: "",
            [parameter3.slug]: "false",
          },
          metadata,
          { forcefullyUnsetDefaultedParametersWithEmptyStringValue: true },
        ),
      ).toEqual({
        [parameter1.id]: [0],
        [parameter3.id]: [false],
      });
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
