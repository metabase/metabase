import {
  createParameter,
  setParameterName,
  setParameterDefaultValue,
  hasMapping,
  isDashboardParameterWithoutMapping,
  getParametersMappedToDashcard,
  hasMatchingParameters,
  getFilteringParameterValuesMap,
  getParameterValuesSearchKey,
  getTargetField,
  getDashboardUiParameters,
} from "metabase/parameters/utils/dashboards";
import Field from "metabase-lib/lib/metadata/Field";

import { PRODUCTS, metadata } from "__support__/sample_database_fixture";

describe("metabase/parameters/utils/dashboards", () => {
  describe("createParameter", () => {
    it("should create a new parameter using the given parameter option", () => {
      expect(
        createParameter(
          {
            name: "foo bar",
            type: "category",
            sectionId: "abc",
          },
          [],
        ),
      ).toEqual({
        id: expect.any(String),
        name: "foo bar",
        sectionId: "abc",
        slug: "foo_bar",
        type: "category",
      });
    });

    it("should prioritize using `combinedName` over `name`", () => {
      expect(
        createParameter(
          {
            combinedName: "foo bar baz",
            name: "foo bar",
            type: "category",
            sectionId: "abc",
          },
          [],
        ),
      ).toEqual({
        id: expect.any(String),
        name: "foo bar baz",
        sectionId: "abc",
        slug: "foo_bar_baz",
        type: "category",
      });
    });

    it("should prevent a duplicate name", () => {
      expect(
        createParameter(
          {
            name: "foo bar",
            type: "category",
            sectionId: "abc",
          },
          [
            createParameter(
              {
                name: "foo bar",
                type: "category",
                sectionId: "abc",
              },
              [],
            ),
          ],
        ),
      ).toEqual({
        id: expect.any(String),
        name: "foo bar 1",
        sectionId: "abc",
        slug: "foo_bar_1",
        type: "category",
      });
    });
  });

  describe("setParameterName", () => {
    it("should set a name and a slug on parameter", () => {
      expect(setParameterName({ abc: 123 }, "foo")).toEqual({
        abc: 123,
        name: "foo",
        slug: "foo",
      });
    });

    it("should default", () => {
      expect(setParameterName({}, "")).toEqual({
        name: "unnamed",
        slug: "unnamed",
      });
    });
  });

  describe("setParameterDefaultValue", () => {
    it("should set a `default` property on a parameter", () => {
      expect(setParameterDefaultValue({ foo: "bar" }, 123)).toEqual({
        foo: "bar",
        default: 123,
      });
    });
  });

  describe("hasMapping", () => {
    const parameter = { id: "foo" };

    it("should return false when there are no cards on the dashboard", () => {
      const dashboard = {
        ordered_cards: [],
      };
      expect(hasMapping(parameter, dashboard)).toBe(false);
    });

    it("should return false when there are no cards with parameter mappings", () => {
      const dashboard = {
        ordered_cards: [
          {
            parameter_mappings: [],
          },
          {
            parameter_mappings: [],
          },
        ],
      };

      expect(hasMapping(parameter, dashboard)).toBe(false);
    });

    it("should return false when missing parameter mappings", () => {
      const dashboard = {
        ordered_cards: [{ parameter_mappings: undefined }],
      };
      expect(hasMapping(parameter, dashboard)).toBe(false);
    });

    it("should return false when there are no matching parameter mapping parameter_ids", () => {
      const dashboard = {
        ordered_cards: [
          {
            parameter_mappings: [
              {
                parameter_id: "bar",
              },
            ],
          },
          {
            parameter_mappings: [
              {
                parameter_id: "baz",
              },
              {
                parameter_id: "abc",
              },
            ],
          },
        ],
      };

      expect(hasMapping(parameter, dashboard)).toBe(false);
    });

    it("should return true when the given parameter's id is found in a parameter_mappings object", () => {
      const dashboard = {
        ordered_cards: [
          {
            parameter_mappings: [
              {
                parameter_id: "bar",
              },
            ],
          },
          {
            parameter_mappings: [
              {
                parameter_id: "baz",
              },
              {
                parameter_id: "foo",
              },
            ],
          },
        ],
      };

      expect(hasMapping(parameter, dashboard)).toBe(true);
    });
  });

  describe("isDashboardParameterWithoutMapping", () => {
    const parameter = { id: "foo" };

    it("should return false when passed a falsy dashboard", () => {
      expect(isDashboardParameterWithoutMapping(parameter, undefined)).toBe(
        false,
      );
    });

    it("should return false when the given parameter is not found in the dashboard's parameters list", () => {
      const brokenDashboard = {
        ordered_cards: [
          {
            parameter_mappings: [
              {
                parameter_id: "bar",
              },
              {
                // having this parameter mapped but not in the parameters list shouldn't happen in practice,
                // but I am proving the significance of having the parameter exist in the dashboard's parameters list
                parameter_id: "foo",
              },
            ],
          },
        ],
        parameters: [
          {
            id: "bar",
          },
        ],
      };

      expect(
        isDashboardParameterWithoutMapping(parameter, brokenDashboard),
      ).toBe(false);
    });

    it("should return false when the given parameter is both found in the dashboard's parameters and also mapped", () => {
      const dashboard = {
        ordered_cards: [
          {
            parameter_mappings: [
              {
                parameter_id: "bar",
              },
              {
                parameter_id: "foo",
              },
            ],
          },
        ],
        parameters: [
          {
            id: "bar",
          },
          { id: "foo" },
        ],
      };

      expect(isDashboardParameterWithoutMapping(parameter, dashboard)).toBe(
        false,
      );
    });

    it("should return true when the given parameter is found on the dashboard but is not mapped", () => {
      const dashboard = {
        ordered_cards: [
          {
            parameter_mappings: [
              {
                parameter_id: "bar",
              },
            ],
          },
        ],
        parameters: [
          {
            id: "bar",
          },
          { id: "foo" },
        ],
      };

      expect(isDashboardParameterWithoutMapping(parameter, dashboard)).toBe(
        true,
      );
    });
  });

  describe("getParametersMappedToDashcard", () => {
    const dashboard = {
      parameters: [
        {
          id: "foo",
          type: "text",
          target: ["variable", ["template-tag", "abc"]],
        },
        {
          id: "bar",
          type: "string/=",
          target: ["dimension", ["field", 123, null]],
        },
        {
          id: "baz",
        },
      ],
    };

    const dashboardWithNoParameters = { parameters: [] };

    const dashcard = {
      parameter_mappings: [
        {
          parameter_id: "foo",
          target: ["variable", ["template-tag", "abc"]],
        },
        {
          parameter_id: "bar",
          target: ["dimension", ["field", 123, null]],
        },
      ],
    };

    const dashcardWithNoMappings = {};

    it("should return the subset of the dashboard's parameters that are found in a given dashcard's parameter_mappings", () => {
      expect(
        getParametersMappedToDashcard(dashboardWithNoParameters, dashcard),
      ).toEqual([]);
      expect(
        getParametersMappedToDashcard(dashboard, dashcardWithNoMappings),
      ).toEqual([]);

      expect(getParametersMappedToDashcard(dashboard, dashcard)).toEqual([
        {
          id: "foo",
          type: "text",
          target: ["variable", ["template-tag", "abc"]],
        },
        {
          id: "bar",
          type: "string/=",
          target: ["dimension", ["field", 123, null]],
        },
      ]);
    });
  });

  describe("hasMatchingParameters", () => {
    it("should return false when the given card is not found on the dashboard", () => {
      const dashboard = {
        ordered_cards: [
          {
            id: 1,
            card_id: 123,
            card: { id: 123 },
            parameter_mappings: [
              {
                card_id: 123,
                parameter_id: "foo",
              },
            ],
          },
        ],
      };

      expect(
        hasMatchingParameters({
          dashboard,
          dashcardId: 1,
          cardId: 456,
          parameters: [],
          metadata,
        }),
      ).toBe(false);

      expect(
        hasMatchingParameters({
          dashboard,
          dashcardId: 2,
          cardId: 123,
          parameters: [],
          metadata,
        }),
      ).toBe(false);
    });

    it("should return false when a given parameter is not found in the dashcard mappings", () => {
      const dashboard = {
        ordered_cards: [
          {
            id: 1,
            card_id: 123,
            card: { id: 123 },
            parameter_mappings: [
              {
                card_id: 123,
                parameter_id: "foo",
              },
            ],
          },
          {
            id: 2,
            card_id: 456,
            card: { id: 456 },
            parameter_mappings: [
              {
                card_id: 456,
                parameter_id: "bar",
              },
            ],
          },
        ],
      };

      expect(
        hasMatchingParameters({
          dashboard,
          dashcardId: 1,
          cardId: 123,
          parameters: [
            {
              id: "foo",
            },
            {
              id: "bar",
            },
          ],
          metadata,
        }),
      ).toBe(false);
    });

    it("should return true when all given parameters are found mapped to the dashcard", () => {
      const dashboard = {
        ordered_cards: [
          {
            id: 1,
            card_id: 123,
            card: { id: 123 },
            parameter_mappings: [
              {
                card_id: 123,
                parameter_id: "foo",
              },
              {
                card_id: 123,
                parameter_id: "bar",
              },
            ],
          },
        ],
      };

      expect(
        hasMatchingParameters({
          dashboard,
          dashcardId: 1,
          cardId: 123,
          parameters: [
            {
              id: "foo",
            },
            {
              id: "bar",
            },
          ],
          metadata,
        }),
      ).toBe(true);
    });
  });

  describe("getFilteringParameterValuesMap", () => {
    const undefinedFilteringParameters = {};
    const emptyFilteringParameters = {
      filteringParameters: [],
    };

    const parameter = {
      filteringParameters: ["a", "b", "c", "d"],
    };
    const parameters = [
      {
        id: "a",
        value: "aaa",
      },
      {
        id: "b",
        value: "bbb",
      },
      {
        id: "c",
      },
      {
        id: "d",
        value: null,
      },
      {
        id: "e",
        value: "eee",
      },
    ];

    it("should create a map of any defined parameterValues found in a specific parameter's filteringParameters property", () => {
      expect(
        getFilteringParameterValuesMap(
          undefinedFilteringParameters,
          parameters,
        ),
      ).toEqual({});
      expect(
        getFilteringParameterValuesMap(emptyFilteringParameters, parameters),
      ).toEqual({});
      expect(getFilteringParameterValuesMap(parameter, parameters)).toEqual({
        a: "aaa",
        b: "bbb",
      });
    });

    it("should handle a missing `filteringParameters` prop gracefully", () => {
      expect(
        getFilteringParameterValuesMap(
          undefinedFilteringParameters,
          parameters,
        ),
      ).toEqual({});
      expect(
        getFilteringParameterValuesMap(emptyFilteringParameters, parameters),
      ).toEqual({});
    });
  });

  describe("getParameterValuesSearchKey", () => {
    it("should return a string using the given props related to parameter value searching", () => {
      expect(
        getParameterValuesSearchKey({
          dashboardId: "123",
          parameterId: "456",
          query: "foo",
          filteringParameterValues: {
            a: "aaa",
            b: "bbb",
          },
        }),
      ).toEqual(
        'dashboardId: 123, parameterId: 456, query: foo, filteringParameterValues: [["a","aaa"],["b","bbb"]]',
      );
    });

    it("should default `query` to null", () => {
      expect(
        getParameterValuesSearchKey({
          dashboardId: "123",
          parameterId: "456",
          filteringParameterValues: {
            a: "aaa",
            b: "bbb",
          },
        }),
      ).toEqual(
        'dashboardId: 123, parameterId: 456, query: null, filteringParameterValues: [["a","aaa"],["b","bbb"]]',
      );
    });

    it("should sort the entries in the `filteringParameterValues` object", () => {
      expect(
        getParameterValuesSearchKey({
          dashboardId: "123",
          parameterId: "456",
          filteringParameterValues: {
            b: "bbb",
            a: "aaa",
          },
        }),
      ).toEqual(
        'dashboardId: 123, parameterId: 456, query: null, filteringParameterValues: [["a","aaa"],["b","bbb"]]',
      );
    });

    it("should handle there being no filteringParameterValues", () => {
      expect(
        getParameterValuesSearchKey({
          dashboardId: "123",
          parameterId: "456",
          query: "abc",
        }),
      ).toEqual(
        "dashboardId: 123, parameterId: 456, query: abc, filteringParameterValues: []",
      );
    });
  });

  describe("getTargetField", () => {
    const target = ["dimension", ["field", 4, null]];

    const metadata = {
      field: jest.fn(),
    };

    it("should return null when given a card without a `dataset_query`", () => {
      const card = {
        id: 1,
      };

      expect(getTargetField(target, card, metadata)).toBe(null);
    });

    it("should return the field that maps to the mapping target", () => {
      const field = {
        id: 4,
        name: "foo",
      };

      metadata.field.mockImplementation(id => {
        if (id === 4) {
          return field;
        }
      });

      const card = {
        id: 1,
        dataset_query: {
          type: "query",
          database: 1,
          query: {
            "source-table": 1,
          },
        },
      };

      expect(getTargetField(target, card, metadata)).toEqual(field);
    });
  });

  describe("getDashboardUiParameters", () => {
    const dashboard = {
      id: 1,
      ordered_cards: [
        {
          id: 1,
          card_id: 123,
          card: { id: 123, dataset_query: { type: "query" } },
          series: [{ id: 789, dataset_query: { type: "query" } }],
          parameter_mappings: [
            {
              card_id: 123,
              parameter_id: "b",
              target: ["breakout", 0],
            },
            {
              card_id: 789,
              parameter_id: "d",
              target: ["dimension", ["field", PRODUCTS.RATING.id, null]],
            },
            {
              card_id: 123,
              parameter_id: "f",
              target: ["dimension", ["field", PRODUCTS.TITLE.id, null]],
            },
            {
              card_id: 123,
              parameter_id: "g",
              target: ["dimension", ["field", PRODUCTS.TITLE.id, null]],
            },
          ],
        },
        {
          id: 2,
          card_id: 456,
          card: {
            id: 456,
            dataset_query: {
              type: "native",
              native: {
                query: "{{foo}}",
                "template-tags": {
                  foo: {
                    type: "text",
                  },
                  bar: {
                    type: "dimension",
                    "widget-type": "string/contains",
                    dimension: ["field", PRODUCTS.TITLE.id, null],
                  },
                },
              },
            },
          },
          parameter_mappings: [
            {
              card_id: 456,
              parameter_id: "e",
              target: ["variable", "foo"],
            },
            {
              card_id: 456,
              parameter_id: "f",
              target: ["dimension", ["template-tag", "bar"]],
            },
            {
              card_id: 456,
              parameter_id: "h",
              target: ["variable", "foo"],
            },
          ],
        },
        {
          id: 3,
          card_id: 999,
          card: { id: 999, dataset_query: { type: "query" } },
          parameter_mappings: [
            {
              card_id: 999,
              parameter_id: "g",
              target: ["dimension", ["field", PRODUCTS.CATEGORY.id, null]],
            },
            {
              card_id: 999,
              parameter_id: "h",
              target: ["dimension", ["field", PRODUCTS.CATEGORY.id, null]],
            },
          ],
        },
        {
          id: 4,
          card_id: 888,
          card: { id: 888, dataset_query: { type: "query" } },
          parameter_mappings: [],
        },
      ],
      parameters: [
        // unmapped, not field filter
        {
          id: "a",
          slug: "slug-a",
          type: "foo",
        },
        // mapped, not field filter
        {
          id: "b",
          slug: "slug-b",
          type: "granularity",
          default: ["day"],
        },
        // unmapped, field filter
        {
          id: "c",
          slug: "slug-c",
          type: "string/=",
        },
        // mapped, field filter
        {
          id: "d",
          slug: "slug-d",
          type: "number/=",
          default: [1, 2, 3],
        },
        // mapped to variable, field filter
        {
          id: "e",
          slug: "slug-e",
          type: "category",
        },
        // field filter, mapped to two cards, same field
        {
          id: "f",
          slug: "slug-f",
          type: "string/contains",
        },
        // field filter, mapped to two, different fields
        {
          id: "g",
          slug: "slug-g",
          type: "string/starts-with",
        },
        // field filter, mapped to field and variable
        {
          id: "h",
          slug: "slug-h",
          type: "string/=",
        },
      ],
    };

    it("should return a list of UiParameter objects from the given dashboard", () => {
      expect(getDashboardUiParameters(dashboard, metadata)).toEqual([
        {
          id: "a",
          slug: "slug-a",
          type: "foo",
        },
        {
          id: "b",
          slug: "slug-b",
          type: "granularity",
          default: ["day"],
        },
        {
          id: "c",
          slug: "slug-c",
          type: "string/=",
          fields: [],
          hasOnlyFieldTargets: false,
        },
        {
          id: "d",
          slug: "slug-d",
          type: "number/=",
          default: [1, 2, 3],
          fields: [expect.any(Field)],
          hasOnlyFieldTargets: true,
        },
        {
          id: "e",
          slug: "slug-e",
          type: "category",
          fields: [],
          hasOnlyFieldTargets: false,
        },
        {
          id: "f",
          slug: "slug-f",
          type: "string/contains",
          fields: [expect.any(Field)],
          hasOnlyFieldTargets: true,
        },
        {
          id: "g",
          slug: "slug-g",
          type: "string/starts-with",
          fields: [expect.any(Field), expect.any(Field)],
          hasOnlyFieldTargets: true,
        },
        {
          id: "h",
          slug: "slug-h",
          type: "string/=",
          fields: [expect.any(Field)],
          hasOnlyFieldTargets: false,
        },
      ]);
    });
  });
});
