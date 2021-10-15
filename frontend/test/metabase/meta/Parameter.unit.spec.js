import MetabaseSettings from "metabase/lib/settings";
import {
  dateParameterValueToMBQL,
  stringParameterValueToMBQL,
  numberParameterValueToMBQL,
  parameterToMBQLFilter,
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
} from "metabase/meta/Parameter";
import { metadata, PRODUCTS } from "__support__/sample_dataset_fixture";

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

  describe("parameterToMBQLFilter", () => {
    it("should return null for parameter targets that are not field dimension targets", () => {
      expect(
        parameterToMBQLFilter({
          target: null,
          type: "category",
          value: ["foo"],
        }),
      ).toBe(null);

      expect(
        parameterToMBQLFilter({ target: [], type: "category", value: ["foo"] }),
      ).toBe(null);

      expect(
        parameterToMBQLFilter({
          target: ["dimension"],
          type: "category",
          value: ["foo"],
        }),
      ).toBe(null);

      expect(
        parameterToMBQLFilter({
          target: ["dimension", ["template-tag", "foo"]],
          type: "category",
          value: ["foo"],
        }),
      ).toBe(null);
    });

    it("should return mbql filter for date parameter", () => {
      expect(
        parameterToMBQLFilter(
          {
            target: ["dimension", ["field", PRODUCTS.CREATED_AT.id, null]],
            type: "date/single",
            value: "01-01-2020",
          },
          metadata,
        ),
      ).toEqual(["=", ["field", PRODUCTS.CREATED_AT.id, null], "01-01-2020"]);
    });

    it("should return mbql filter for string parameter", () => {
      expect(
        parameterToMBQLFilter(
          {
            target: ["dimension", ["field", PRODUCTS.CATEGORY.id, null]],
            type: "string/starts-with",
            value: "foo",
          },
          metadata,
        ),
      ).toEqual(["starts-with", ["field", PRODUCTS.CATEGORY.id, null], "foo"]);

      expect(
        parameterToMBQLFilter(
          {
            target: ["dimension", ["field", PRODUCTS.CATEGORY.id, null]],
            type: "string/starts-with",
            value: ["foo"],
          },
          metadata,
        ),
      ).toEqual(["starts-with", ["field", PRODUCTS.CATEGORY.id, null], "foo"]);
    });

    it("should return mbql filter for category parameter", () => {
      expect(
        parameterToMBQLFilter(
          {
            target: ["dimension", ["field", PRODUCTS.CATEGORY.id, null]],
            type: "category",
            value: ["foo", "bar"],
          },
          metadata,
        ),
      ).toEqual(["=", ["field", PRODUCTS.CATEGORY.id, null], "foo", "bar"]);
    });

    it("should return mbql filter for number parameter", () => {
      expect(
        parameterToMBQLFilter(
          {
            target: ["dimension", ["field", PRODUCTS.RATING.id, null]],
            type: "number/=",
            value: [111],
          },
          metadata,
        ),
      ).toEqual(["=", ["field", PRODUCTS.RATING.id, null], 111]);

      expect(
        parameterToMBQLFilter(
          {
            target: ["dimension", ["field", PRODUCTS.RATING.id, null]],
            type: "number/=",
            value: 111,
          },
          metadata,
        ),
      ).toEqual(["=", ["field", PRODUCTS.RATING.id, null], 111]);

      expect(
        parameterToMBQLFilter(
          {
            target: ["dimension", ["field", PRODUCTS.RATING.id, null]],
            type: "number/between",
            value: [1, 100],
          },
          metadata,
        ),
      ).toEqual(["between", ["field", PRODUCTS.RATING.id, null], 1, 100]);
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
        isNumeric: () => false,
        isDate: () => false,
        isBoolean: () => false,
      };
      field2 = {
        id: 2,
        isNumeric: () => false,
        isDate: () => false,
        isBoolean: () => false,
      };
      field3 = {
        id: 3,
        isNumeric: () => false,
        isDate: () => false,
        isBoolean: () => false,
      };
      field4 = {
        id: 4,
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
      };

      // found in queryParams and not defaulted
      parameter1 = {
        id: 111,
        slug: "foo",
        field_ids: [1, 4],
      };
      // found in queryParams and defaulted
      parameter2 = {
        id: 222,
        slug: "bar",
        default: "parameter2 default value",
        field_id: 2,
      };
      // not found in queryParams and defaulted
      parameter3 = {
        id: 333,
        slug: "baz",
        default: "parameter3 default value",
        field_ids: [["field", 3, null]],
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
        expect(getValuePopulatedParameters(parameters, null)).toEqual(
          parameters,
        );
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
        ).toBe("parameter1 queryParam value");
      });

      it("should ignore the parameter's default value when the parameter value is found in queryParams", () => {
        expect(
          getParameterValueFromQueryParams(parameter2, queryParams, metadata),
        ).toBe("parameter2 queryParam value");
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
        ).toBe(123.456);

        expect(
          getParameterValueFromQueryParams(
            parameter1,
            {
              [parameter1.slug]: "",
            },
            metadata,
          ),
        ).toBe(NaN);
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
        ).toBe("123.456");
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
        ).toBe(true);

        expect(
          getParameterValueFromQueryParams(
            parameter1,
            {
              [parameter1.slug]: "false",
            },
            metadata,
          ),
        ).toBe(false);

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
        ).toBe("foo");
      });

      it("should not normalize date parameters", () => {
        parameter1.type = "date/foo";
        parameter1.hasOnlyFieldTargets = true;

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
        parameter1.hasOnlyFieldTargets = false;

        expect(
          getParameterValueFromQueryParams(
            parameter1,
            {
              [parameter1.slug]: "foo",
            },
            metadata,
          ),
        ).toEqual("foo");
      });

      it("should not normalize empty string parameter values", () => {
        parameter1.type = "category";
        parameter1.hasOnlyFieldTargets = true;

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
        parameter1.hasOnlyFieldTargets = true;

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
        ).toBe(true);
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
        ).toBe("true");
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
        ).toBe(NaN);

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
            [parameter1.id]: "parameter1 queryParam value",
            [parameter2.id]: "parameter2 queryParam value",
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
                [parameter2.slug]: "parameter2 default value",
                [parameter3.slug]: "false",
              },
              metadata,
              { forcefullyUnsetDefaultedParametersWithEmptyStringValue: false },
            ),
          ).toEqual({
            [parameter1.id]: 0,
            [parameter2.id]: "parameter2 default value",
            [parameter3.id]: false,
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
          [parameter1.id]: 0,
          [parameter3.id]: false,
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
});
