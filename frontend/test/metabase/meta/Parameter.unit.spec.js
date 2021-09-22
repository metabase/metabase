import MetabaseSettings from "metabase/lib/settings";
import {
  dateParameterValueToMBQL,
  stringParameterValueToMBQL,
  numberParameterValueToMBQL,
  parameterOptionsForField,
  normalizeParameterValue,
  deriveFieldOperatorFromParameter,
  getTemplateTagParameters,
  getValuePopulatedParameters,
  getParameterValueFromQueryParams,
  getParameterValuesByIdFromQueryParams,
  getParameterValuesBySlug,
  buildHiddenParametersSlugSet,
  getVisibleParameters,
  parseParameterValueForFields,
} from "metabase/meta/Parameter";
import Field from "metabase-lib/lib/metadata/Field";
import { ORDERS, PRODUCTS } from "__support__/sample_dataset_fixture";

MetabaseSettings.get = jest.fn();

function mockFieldFilterOperatorsFlag(value) {
  MetabaseSettings.get.mockImplementation(flag => {
    if (flag === "field-filter-operators-enabled?") {
      return value;
    }
  });
}

describe("metabase/meta/Parameter", () => {
  beforeEach(() => {
    MetabaseSettings.get.mockReturnValue(false);
  });

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

  describe("getTemplateTagParameters", () => {
    let tags;
    beforeEach(() => {
      tags = [
        {
          "widget-type": "foo",
          type: "string",
          id: 1,
          name: "a",
          "display-name": "A",
          default: "abc",
        },
        {
          type: "string",
          id: 2,
          name: "b",
          "display-name": "B",
        },
        {
          type: "number",
          id: 3,
          name: "c",
          "display-name": "C",
        },
        {
          type: "date",
          id: 4,
          name: "d",
          "display-name": "D",
        },
        {
          "widget-type": "foo",
          type: "dimension",
          id: 5,
          name: "e",
          "display-name": "E",
        },
        {
          type: null,
          id: 6,
        },
        {
          type: "dimension",
          id: 7,
          name: "f",
          "display-name": "F",
        },
      ];
    });

    describe("field filter operators enabled", () => {
      beforeEach(() => {
        mockFieldFilterOperatorsFlag(true);
      });

      it("should convert tags into tag parameters with field filter operator types", () => {
        const parametersWithFieldFilterOperatorTypes = [
          {
            default: "abc",
            id: 1,
            name: "A",
            slug: "a",
            target: ["variable", ["template-tag", "a"]],
            type: "foo",
          },
          {
            default: undefined,
            id: 2,
            name: "B",
            slug: "b",
            target: ["variable", ["template-tag", "b"]],
            type: "string/=",
          },
          {
            default: undefined,
            id: 3,
            name: "C",
            slug: "c",
            target: ["variable", ["template-tag", "c"]],
            type: "number/=",
          },
          {
            default: undefined,
            id: 4,
            name: "D",
            slug: "d",
            target: ["variable", ["template-tag", "d"]],
            type: "date/single",
          },
          {
            default: undefined,
            id: 5,
            name: "E",
            slug: "e",
            target: ["dimension", ["template-tag", "e"]],
            type: "foo",
          },
        ];

        expect(getTemplateTagParameters(tags)).toEqual(
          parametersWithFieldFilterOperatorTypes,
        );
      });
    });

    describe("field filter operators disabled", () => {
      it("should convert tags into tag parameters", () => {
        const parameters = [
          {
            default: "abc",
            id: 1,
            name: "A",
            slug: "a",
            target: ["variable", ["template-tag", "a"]],
            type: "foo",
          },
          {
            default: undefined,
            id: 2,
            name: "B",
            slug: "b",
            target: ["variable", ["template-tag", "b"]],
            type: "category",
          },
          {
            default: undefined,
            id: 3,
            name: "C",
            slug: "c",
            target: ["variable", ["template-tag", "c"]],
            type: "category",
          },
          {
            default: undefined,
            id: 4,
            name: "D",
            slug: "d",
            target: ["variable", ["template-tag", "d"]],
            type: "date/single",
          },
          {
            default: undefined,
            id: 5,
            name: "E",
            slug: "e",
            target: ["dimension", ["template-tag", "e"]],
            type: "foo",
          },
        ];
        expect(getTemplateTagParameters(tags)).toEqual(parameters);
      });
    });
  });

  describe("parameter collection-building utils", () => {
    // found in queryParams and not defaulted
    const parameter1 = {
      id: 1,
      slug: "foo",
    };
    // found in queryParams and defaulted
    const parameter2 = {
      id: 2,
      slug: "bar",
      default: "parameter2 default value",
    };
    // not found in queryParams and defaulted
    const parameter3 = {
      id: 3,
      slug: "baz",
      default: "parameter3 default value",
    };
    // not found in queryParams and not defaulted
    const parameter4 = {
      id: 4,
      slug: "qux",
    };
    const parameters = [parameter1, parameter2, parameter3, parameter4];
    const queryParams = {
      foo: "parameter1 queryParam value",
      bar: "parameter2 queryParam value",
      valueNotFoundInParameters: "nonexistent parameter queryParam value",
    };

    // typically generated using getParameterValuesByIdFromQueryParams(parameters, queryParams)
    const parameterValues = {
      [parameter1.id]: "parameter1 parameterValue",
      [parameter2.id]: "parameter2 parameterValue",
      [parameter3.id]: "parameter3 default value",
    };

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
        expect(getValuePopulatedParameters(parameters, null)).toEqual(
          parameters,
        );
      });
    });

    describe("getParameterValueFromQueryParams", () => {
      it("should return undefined when given an undefined queryParams arg", () => {
        expect(getParameterValueFromQueryParams(parameter1)).toBe(undefined);
      });

      it("should return the parameter's default value when given an undefined queryParams arg", () => {
        expect(getParameterValueFromQueryParams(parameter2)).toBe(
          "parameter2 default value",
        );
      });

      it("should return the parameter's default value when the parameter value is not found in queryParams", () => {
        expect(getParameterValueFromQueryParams(parameter3, queryParams)).toBe(
          "parameter3 default value",
        );
      });

      it("should return the parameter value found in the queryParams object", () => {
        expect(getParameterValueFromQueryParams(parameter1, queryParams)).toBe(
          "parameter1 queryParam value",
        );
      });

      it("should ignore the parameter's default value when the parameter value is found in queryParams", () => {
        expect(getParameterValueFromQueryParams(parameter2, queryParams)).toBe(
          "parameter2 queryParam value",
        );
      });

      it("should return an empty string as the value for a defaulted parameter because we handle that special case elsewhere", () => {
        expect(
          getParameterValueFromQueryParams(parameter2, {
            [parameter2.slug]: "",
          }),
        ).toBe("");
      });
    });

    describe("getParameterValuesByIdFromQueryParams", () => {
      describe("`forcefullyUnsetDefaultedParametersWithEmptyStringValue` === false", () => {
        it("should generate a map of parameter values found in the queryParams or with default values", () => {
          expect(
            getParameterValuesByIdFromQueryParams(parameters, queryParams),
          ).toEqual({
            [parameter1.id]: "parameter1 queryParam value",
            [parameter2.id]: "parameter2 queryParam value",
            [parameter3.id]: "parameter3 default value",
          });
        });

        it("should handle an undefined queryParams", () => {
          expect(getParameterValuesByIdFromQueryParams(parameters)).toEqual({
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
            ),
          ).toEqual(
            getParameterValuesByIdFromQueryParams(
              parameters,
              queryParamsWithSpecialCase,
              { forcefullyUnsetDefaultedParametersWithEmptyStringValue: false },
            ),
          );
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
              { forcefullyUnsetDefaultedParametersWithEmptyStringValue: true },
            ),
          ).toEqual({
            [parameter3.id]: "parameter3 default value",
          });
        });
      });
    });

    describe("getParameterValuesBySlug", () => {
      describe("`preserveDefaultedParameters` === false", () => {
        it("should return a map of defined parameter values keyed by the parameter's slug", () => {
          expect(getParameterValuesBySlug(parameters, parameterValues)).toEqual(
            {
              [parameter1.slug]: "parameter1 parameterValue",
              [parameter2.slug]: "parameter2 parameterValue",
              [parameter3.slug]: "parameter3 default value",
            },
          );
        });

        it("should prioritize values found on the parameter object over the parameterValues map", () => {
          const valuePopulatedParameter1 = {
            ...parameter1,
            value: "parameter1 value prop",
          };
          const parameters = [valuePopulatedParameter1, parameter2];

          expect(getParameterValuesBySlug(parameters, parameterValues)).toEqual(
            {
              [parameter1.slug]: "parameter1 value prop", // was set on parameter object
              [parameter2.slug]: "parameter2 parameterValue", // was NOT set on parameter object, found on parameterValues
            },
          );
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
            [defaultedParameterWithValue.slug]:
              defaultedParameterWithValue.value,
          });

          expect(
            getParameterValuesBySlug(
              parameters,
              {},
              { preserveDefaultedParameters: false },
            ),
          ).toEqual(getParameterValuesBySlug(parameters, parameterValues));
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
            [defaultedParameterWithValue.slug]:
              defaultedParameterWithValue.value,
          });
        });
      });
    });
  });

  describe("buildHiddenParametersSlugSet", () => {
    it("should turn the given string of slugs separated by commas into a set of slug strings", () => {
      expect(buildHiddenParametersSlugSet("a,b,c")).toEqual(
        new Set(["a", "b", "c"]),
      );
    });

    it("should return an empty set for any input that is not a string", () => {
      expect(buildHiddenParametersSlugSet(undefined)).toEqual(new Set());
      expect(buildHiddenParametersSlugSet(111111)).toEqual(new Set());
    });
  });

  describe("getVisibleParameters", () => {
    const parameters = [
      {
        id: 1,
        slug: "foo",
      },
      {
        id: 2,
        slug: "bar",
      },
      {
        id: 3,
        slug: "baz",
      },
      {
        id: 4,
        slug: "qux",
      },
    ];

    const hiddenParameterSlugs = "bar,baz";

    it("should return the parameters that are not hidden", () => {
      expect(getVisibleParameters(parameters, hiddenParameterSlugs)).toEqual([
        {
          id: 1,
          slug: "foo",
        },
        {
          id: 4,
          slug: "qux",
        },
      ]);
    });
  });

  describe("parseParameterValueForFields", () => {
    it("should parse numbers", () => {
      expect(parseParameterValueForFields("1.23", [ORDERS.TOTAL])).toBe(1.23);
    });

    it("should parse booleans", () => {
      // the sample dataset doesn't have any boolean columns, so we fake one
      const field = { isBoolean: () => true, isNumeric: () => false };
      expect(parseParameterValueForFields("true", [field])).toBe(true);
    });

    it("should parse multiple values", () => {
      const result = parseParameterValueForFields(
        ["123", "321"],
        [ORDERS.PRODUCT_ID],
      );
      expect(result).toEqual([123, 321]);
    });

    it("should not parse if some connected fields are strings", () => {
      const result = parseParameterValueForFields("123", [
        PRODUCTS.ID,
        PRODUCTS.TITLE,
      ]);
      expect(result).toBe("123");
    });

    it("should not parse if there are no fields", () => {
      const result = parseParameterValueForFields("123", []);
      expect(result).toBe("123");
    });

    it("should not parse date/numeric fields", () => {
      const dateField = new Field({
        ...ORDERS.QUANTITY, // some numeric field
        // this test doesn't make as much sense now that coercions set effective_types
        effective_type: "type/DateTime", // make it a date
        coercion_strategy: "Coercion/UNIXSeconds->DateTime",
      });
      const result = parseParameterValueForFields("past30days", [dateField]);
      expect(result).toBe("past30days");
    });
  });
});
