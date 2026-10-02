import type { FieldFilterUiParameter } from "metabase-lib/v1/parameters/types";
import type {
  Field,
  Parameter,
  ParameterValueOrArray,
  ParameterValuesMap,
} from "metabase-types/api";
import { createMockField, createMockParameter } from "metabase-types/api/mocks";

import {
  getParameterValueFromQueryParams,
  getParameterValuesByIdFromQueryParams,
} from "./parameter-parsing";

// the root type, so every type predicate is false until a test sets a type
const UNTYPED = "type/*";

// bypasses the strict signature to pin the runtime `|| {}` guard
const UNDEFINED_QUERY_PARAMS = undefined as unknown as ParameterValuesMap;

describe("parameters/utils/parameter-values", () => {
  let field1: Field;
  let field2: Field;
  let field3: Field;
  let field4: Field;
  let parameter1: FieldFilterUiParameter;
  let parameter2: FieldFilterUiParameter;
  let parameter3: FieldFilterUiParameter;
  let parameter4: Parameter;
  let parameters: Parameter[];
  let queryParams: ParameterValuesMap;

  beforeEach(() => {
    field1 = createMockField({
      id: 1,
      table_id: 1,
      base_type: UNTYPED,
    });
    field2 = createMockField({
      id: 2,
      table_id: 1,
      base_type: UNTYPED,
    });
    field3 = createMockField({
      id: 3,
      table_id: 1,
      base_type: UNTYPED,
    });
    field4 = createMockField({
      id: 4,
      table_id: 1,
      base_type: UNTYPED,
    });

    // found in queryParams and not defaulted
    parameter1 = {
      ...createMockParameter({
        id: "111",
        slug: "foo",
      }),
      fields: [field1, field4],
    };
    // found in queryParams and defaulted
    parameter2 = {
      ...createMockParameter({
        id: "222",
        slug: "bar",
        default: "parameter2 default value",
      }),
      fields: [field2],
    };
    // not found in queryParams and defaulted
    parameter3 = {
      ...createMockParameter({
        id: "333",
        slug: "baz",
        default: "parameter3 default value",
      }),
      fields: [field3],
    };
    // not found in queryParams and not defaulted
    parameter4 = createMockParameter({
      id: "444",
      slug: "qux",
    });
    parameters = [parameter1, parameter2, parameter3, parameter4];
    queryParams = {
      foo: "parameter1 queryParam value",
      bar: "parameter2 queryParam value",
      valueNotFoundInParameters: "nonexistent parameter queryParam value",
    };
  });

  describe("getParameterValueFromQueryParams", () => {
    it("should return null when given an undefined queryParams arg", () => {
      expect(
        getParameterValueFromQueryParams(parameter1, UNDEFINED_QUERY_PARAMS),
      ).toBe(null);
    });

    it("should return the parameter's default value when given an undefined queryParams arg", () => {
      expect(
        getParameterValueFromQueryParams(parameter2, UNDEFINED_QUERY_PARAMS),
      ).toBe("parameter2 default value");
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
      field1.base_type = "type/Integer";
      field4.base_type = "type/Integer";

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
      // a unix timestamp is stored as a number and coerced to a date
      field1.base_type = "type/BigInteger";
      field1.effective_type = "type/DateTime";
      field1.coercion_strategy = "Coercion/UNIXSeconds->DateTime";
      field4.base_type = "type/Integer";

      expect(
        getParameterValueFromQueryParams(parameter1, {
          [parameter1.slug]: "123.456",
        }),
      ).toEqual(["123.456"]);
    });

    it("should convert boolean arguments to strings if all mapped fields are strings", () => {
      field1.base_type = "type/Text";
      field4.base_type = "type/TextLike";

      expect(
        getParameterValueFromQueryParams(parameter1, {
          [parameter1.slug]: true,
        }),
      ).toEqual(["true"]);
    });

    it("should parse a value of 'true' or 'false' as a boolean if all associated fields are booleans", () => {
      field1.base_type = "type/Boolean";
      field4.base_type = "type/Boolean";

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
      ).toEqual([]);
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
      field3.base_type = "type/Boolean";

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

    it("should handle legacy parameters without a type", () => {
      // legacy saved parameters may lack `type`, which Parameter requires
      const typelessParameter = {
        id: "555",
        slug: "legacy",
        fields: [field1, field4],
      } as unknown as FieldFilterUiParameter;

      expect(
        getParameterValueFromQueryParams(typelessParameter, {
          [typelessParameter.slug]: "foo",
        }),
      ).toEqual(["foo"]);
    });

    it("should not try to parse default values", () => {
      field2.base_type = "type/Integer";

      expect(
        getParameterValueFromQueryParams(parameter2, {
          [parameter2.slug]: "parameter2 default value",
        }),
      ).toEqual([]);

      expect(getParameterValueFromQueryParams(parameter2, {})).toBe(
        "parameter2 default value",
      );
    });

    it.each([
      { value: "", expectedValue: null },
      { value: "abc", expectedValue: [] },
      { value: "123", expectedValue: [123] },
      { value: "123abc", expectedValue: [123] },
      { value: ["123"], expectedValue: [123] },
      { value: ["123", "234"], expectedValue: [123, 234] },
      { value: ["123", "abc"], expectedValue: [123] },
      { value: ["123", "234abc"], expectedValue: [123, 234] },
      { value: "123,234", expectedValue: ["123,234"] },
      { value: "123,abc", expectedValue: null },
      { value: "123,234abc", expectedValue: ["123,234"] },
      { value: 123, expectedValue: [123] },
      { value: [1, 2, 3], expectedValue: [1, 2, 3] },
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

      it("should not allow mixed query and last used parameter values (metabase#48524)", () => {
        expect(
          getParameterValueFromQueryParams(
            parameter1,
            { [parameter2.slug]: "value" },
            { [parameter1.id]: "last used value" },
          ),
        ).toEqual(null);
      });
    });

    describe("for number filter type", () => {
      const numberParameter = createMockParameter({
        id: "111",
        slug: "numberParameter",
        type: "number/=",
      });

      const runGetParameterValueFromQueryParams = (
        value: ParameterValueOrArray,
      ) =>
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
        getParameterValuesByIdFromQueryParams(
          parameters,
          UNDEFINED_QUERY_PARAMS,
        ),
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
      field1.base_type = "type/Integer";
      field4.base_type = "type/Integer";
      field3.base_type = "type/Boolean";

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
      field1.base_type = "type/Integer";
      field4.base_type = "type/Integer";
      field3.base_type = "type/Boolean";

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
