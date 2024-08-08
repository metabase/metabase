import { createMockParameter } from "metabase-types/api/mocks";

import {
  getParameterValueFromQueryParams,
  getParameterValuesByIdFromQueryParams,
} from "./parameter-values";

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
  });

  describe("getParameterValueFromQueryParams", () => {
    it("should return null when given an undefined queryParams arg", () => {
      expect(getParameterValueFromQueryParams(parameter1, undefined)).toBe(
        null,
      );
    });

    it("should return the parameter's default value when given an undefined queryParams arg", () => {
      expect(getParameterValueFromQueryParams(parameter2, undefined)).toBe(
        "parameter2 default value",
      );
    });

    it("should return the parameter's default value when the parameter value is not found in queryParams", () => {
      expect(getParameterValueFromQueryParams(parameter3, queryParams)).toBe(
        "parameter3 default value",
      );
    });

    it("should only allow multiple values for parameters by default", () => {
      const parameter = createMockParameter();
      const queryParams = { [parameter.slug]: ["ab", "cd"] };
      expect(getParameterValueFromQueryParams(parameter, queryParams)).toEqual([
        "ab",
        "cd",
      ]);
    });

    it("should only allow 1 value for single-value parameters", () => {
      const parameter = createMockParameter({ isMultiSelect: false });
      const queryParams = { [parameter.slug]: ["ab", "cd"] };
      expect(getParameterValueFromQueryParams(parameter, queryParams)).toEqual([
        "ab",
      ]);
    });

    it("should only allow multiple values for multi-value parameters", () => {
      const parameter = createMockParameter({ isMultiSelect: true });
      const queryParams = { [parameter.slug]: ["ab", "cd"] };
      expect(getParameterValueFromQueryParams(parameter, queryParams)).toEqual([
        "ab",
        "cd",
      ]);
    });

    it("should return null when the parameter is not in queryParams and has no default", () => {
      expect(getParameterValueFromQueryParams(parameter1, {})).toBe(null);
    });

    it("should return the parameter value found in the queryParams object", () => {
      expect(getParameterValueFromQueryParams(parameter1, queryParams)).toEqual(
        ["parameter1 queryParam value"],
      );
    });

    it("should ignore the parameter's default value when the parameter value is found in queryParams", () => {
      expect(getParameterValueFromQueryParams(parameter2, queryParams)).toEqual(
        ["parameter2 queryParam value"],
      );
    });

    it("should return null as the value for a defaulted parameter because we handle that special case elsewhere", () => {
      expect(
        getParameterValueFromQueryParams(parameter2, {
          [parameter2.slug]: "",
        }),
      ).toBe(null);
    });

    it("should parse the parameter value as a float if all associated fields are numeric and not dates", () => {
      field1.isNumeric = () => true;
      field1.isDate = () => false;

      field4.isNumeric = () => true;
      field4.isDate = () => false;

      expect(
        getParameterValueFromQueryParams(parameter1, {
          [parameter1.slug]: "123.456",
        }),
      ).toEqual([123.456]);

      expect(
        getParameterValueFromQueryParams(parameter1, {
          [parameter1.slug]: "",
        }),
      ).toBe(null);
    });

    it("should not parse numeric values that are dates as floats", () => {
      field1.isNumeric = () => true;
      field1.isDate = () => true;

      field4.isNumeric = () => true;
      field4.isDate = () => false;

      expect(
        getParameterValueFromQueryParams(parameter1, {
          [parameter1.slug]: "123.456",
        }),
      ).toEqual(["123.456"]);
    });

    it("should parse a value of 'true' or 'false' as a boolean if all associated fields are booleans", () => {
      field1.isBoolean = () => true;
      field4.isBoolean = () => true;

      expect(
        getParameterValueFromQueryParams(parameter1, {
          [parameter1.slug]: "true",
        }),
      ).toEqual([true]);

      expect(
        getParameterValueFromQueryParams(parameter1, {
          [parameter1.slug]: "false",
        }),
      ).toEqual([false]);

      expect(
        getParameterValueFromQueryParams(parameter1, {
          [parameter1.slug]: "",
        }),
      ).toBe(null);

      expect(
        getParameterValueFromQueryParams(parameter1, {
          [parameter1.slug]: "foo",
        }),
      ).toEqual(["foo"]);
    });

    it("should not normalize date parameters", () => {
      parameter1.type = "date/foo";
      parameter1.hasVariableTemplateTagTarget = false;

      expect(
        getParameterValueFromQueryParams(parameter1, {
          [parameter1.slug]: "123",
        }),
      ).toEqual("123");
    });

    it("should not normalize parameters mapped to non-field targets", () => {
      parameter1.type = "category";
      parameter1.hasVariableTemplateTagTarget = true;

      expect(
        getParameterValueFromQueryParams(parameter1, {
          [parameter1.slug]: "foo",
        }),
      ).toEqual(["foo"]);
    });

    it("should not normalize empty string parameter values", () => {
      parameter1.type = "category";
      parameter1.hasVariableTemplateTagTarget = false;

      expect(
        getParameterValueFromQueryParams(parameter1, {
          [parameter1.slug]: "",
        }),
      ).toBe(null);
    });

    it("should normalize non-date parameters mapped only to field targets", () => {
      parameter1.type = "category";
      parameter1.hasVariableTemplateTagTarget = false;

      expect(
        getParameterValueFromQueryParams(parameter1, {
          [parameter1.slug]: "foo",
        }),
      ).toEqual(["foo"]);

      expect(
        getParameterValueFromQueryParams(parameter1, {
          [parameter1.slug]: ["foo", "bar"],
        }),
      ).toEqual(["foo", "bar"]);
    });

    it("should be able to get the underlying field of a parameter tied to a dimension", () => {
      field3.isBoolean = () => true;

      expect(
        getParameterValueFromQueryParams(parameter3, {
          [parameter3.slug]: "true",
        }),
      ).toEqual([true]);
    });

    it("should not try to parse parameters without fields", () => {
      expect(
        getParameterValueFromQueryParams(parameter4, {
          [parameter4.slug]: "true",
        }),
      ).toEqual(["true"]);
    });

    it("should not try to parse default values", () => {
      field2.isNumeric = () => true;
      field2.isDate = () => false;

      expect(
        getParameterValueFromQueryParams(parameter2, {
          [parameter2.slug]: "parameter2 default value",
        }),
      ).toEqual([NaN]);

      expect(getParameterValueFromQueryParams(parameter2, {})).toBe(
        "parameter2 default value",
      );
    });

    it.each([
      { value: "", expectedValue: null },
      { value: "abc", expectedValue: null },
      { value: "123", expectedValue: [123] },
      { value: "123abc", expectedValue: [123] },
      { value: ["123"], expectedValue: [123] },
      { value: ["123", "234"], expectedValue: [123, 234] },
      { value: ["123", "abc"], expectedValue: null },
      { value: ["123", "234abc"], expectedValue: [123, 234] },
      { value: "123,234", expectedValue: ["123,234"] },
      { value: "123,abc", expectedValue: null },
      { value: "123,234abc", expectedValue: ["123,234"] },
    ])(
      "should parse number parameter value $value",
      ({ value, expectedValue }) => {
        const parameter = createMockParameter({ type: "number/=" });
        const queryParams = { [parameter.slug]: value };
        expect(
          getParameterValueFromQueryParams(parameter, queryParams),
        ).toEqual(expectedValue);
      },
    );

    describe("last used param value", () => {
      it("should use query parameter over last used param value", () => {
        expect(
          getParameterValueFromQueryParams(
            parameter2,
            {
              [parameter2.slug]: "parameter 2 value",
            },
            { [parameter2.id]: "last used value" },
          ),
        ).toEqual(["parameter 2 value"]);
      });

      it("should use last used param value when query parameter is empty", () => {
        expect(
          getParameterValueFromQueryParams(
            parameter2,
            {},
            { [parameter2.id]: "last used value" },
          ),
        ).toEqual("last used value");
      });
    });

    describe("for number filter type", () => {
      const numberParameter = {
        id: 111,
        slug: "numberParameter",
        type: "number/=",
      };

      const runGetParameterValueFromQueryParams = value =>
        getParameterValueFromQueryParams(numberParameter, {
          [numberParameter.slug]: value,
        });

      it("should parse the parameter value as a float when it is a number parameter without fields", () => {
        expect(runGetParameterValueFromQueryParams("123.456")).toEqual([
          123.456,
        ]);
      });

      describe("when parsing parameter value that is a comma-separated list of numbers", () => {
        it("should return list when every item is a number", () => {
          expect(runGetParameterValueFromQueryParams("1,,2,3,4")).toEqual([
            "1,2,3,4",
          ]);
          expect(runGetParameterValueFromQueryParams("1, ,2,3,4")).toEqual([
            "1,2,3,4",
          ]);
          expect(runGetParameterValueFromQueryParams(",1,2,3,")).toEqual([
            "1,2,3",
          ]);
        });

        it("should return `null` when list is not formatted properly", () => {
          expect(runGetParameterValueFromQueryParams(",,,")).toEqual(null);
          expect(runGetParameterValueFromQueryParams(" ")).toEqual(null);
        });

        it("should return `null` if value includes non-numeric characters", () => {
          expect(runGetParameterValueFromQueryParams("1,a,3,")).toEqual(null);
          expect(runGetParameterValueFromQueryParams("1a,b,3,")).toEqual(null);
        });
      });
    });
  });

  describe("getParameterValuesByIdFromQueryParams", () => {
    it("should generate a map of all parameter values, including those in the queryParams or with default values", () => {
      expect(
        getParameterValuesByIdFromQueryParams(parameters, queryParams),
      ).toEqual({
        [parameter1.id]: ["parameter1 queryParam value"],
        [parameter2.id]: ["parameter2 queryParam value"],
        [parameter3.id]: "parameter3 default value",
        [parameter4.id]: null,
      });
    });

    it("should handle an undefined queryParams", () => {
      expect(
        getParameterValuesByIdFromQueryParams(parameters, undefined),
      ).toEqual({
        [parameter1.id]: null,
        [parameter2.id]: "parameter2 default value",
        [parameter3.id]: "parameter3 default value",
        [parameter4.id]: null,
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
        ),
      ).toEqual({
        [parameter1.id]: null, // no default and empty string value
        [parameter2.id]: null, // has default and empty string value
        [parameter3.id]: "parameter3 default value", // has default and no empty string value
        [parameter4.id]: null, // no default and no empty string value
      });

      expect(
        getParameterValuesByIdFromQueryParams(
          parameters,
          queryParamsWithSpecialCase,
        ),
      ).toEqual(
        getParameterValuesByIdFromQueryParams(
          parameters,
          queryParamsWithSpecialCase,
        ),
      );
    });

    it("should not filter out falsy non-nil values", () => {
      field1.isNumeric = () => true;
      field4.isNumeric = () => true;
      field3.isBoolean = () => true;

      expect(
        getParameterValuesByIdFromQueryParams(parameters, {
          [parameter1.slug]: "0",
          [parameter2.slug]: "parameter2 foo value",
          [parameter3.slug]: "false",
        }),
      ).toEqual({
        [parameter1.id]: [0],
        [parameter2.id]: ["parameter2 foo value"],
        [parameter3.id]: [false],
        [parameter4.id]: null,
      });
    });

    it("should have null values for defaulted parameters set to ''", () => {
      const queryParamsWithSpecialCase = {
        ...queryParams,
        [parameter1.slug]: "", // this parameter has no default
        [parameter2.slug]: "", // this parameter has a default
      };

      expect(
        getParameterValuesByIdFromQueryParams(
          parameters,
          queryParamsWithSpecialCase,
        ),
      ).toEqual({
        [parameter1.id]: null,
        [parameter2.id]: null,
        [parameter3.id]: "parameter3 default value",
        [parameter4.id]: null,
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
          { forcefullyUnsetDefaultedParametersWithEmptyStringValue: true },
        ),
      ).toEqual({
        [parameter1.id]: [0],
        [parameter2.id]: null,
        [parameter3.id]: [false],
        [parameter4.id]: null,
      });
    });
  });
});
