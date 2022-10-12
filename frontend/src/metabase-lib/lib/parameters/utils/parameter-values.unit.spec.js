import { getValuePopulatedParameters } from "metabase-lib/lib/parameters/utils/parameter-values";

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
});
