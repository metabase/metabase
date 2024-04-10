import { createMockMetadata } from "__support__/metadata";
import {
  createParameter,
  setParameterName,
  hasMapping,
  getParametersMappedToDashcard,
  hasMatchingParameters,
  getFilteringParameterValuesMap,
  getDashboardUiParameters,
} from "metabase/parameters/utils/dashboards";
import Question from "metabase-lib/v1/Question";
import Field from "metabase-lib/v1/metadata/Field";
import {
  createSampleDatabase,
  PRODUCTS,
} from "metabase-types/api/mocks/presets";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

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

    it("should not default", () => {
      expect(setParameterName({}, "")).toEqual({
        name: "",
        slug: "",
      });
    });
  });

  describe("hasMapping", () => {
    const parameter = { id: "foo" };

    it("should return false when there are no cards on the dashboard", () => {
      const dashboard = {
        dashcards: [],
      };
      expect(hasMapping(parameter, dashboard)).toBe(false);
    });

    it("should return false when there are no cards with parameter mappings", () => {
      const dashboard = {
        dashcards: [
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
        dashcards: [{ parameter_mappings: undefined }],
      };
      expect(hasMapping(parameter, dashboard)).toBe(false);
    });

    it("should return false when there are no matching parameter mapping parameter_ids", () => {
      const dashboard = {
        dashcards: [
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
        dashcards: [
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
        dashcards: [
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
        dashcards: [
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
        dashcards: [
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

  describe("getDashboardUiParameters", () => {
    const dashboard = {
      id: 1,
      dashcards: [
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
              target: ["dimension", ["field", PRODUCTS.RATING, null]],
            },
            {
              card_id: 123,
              parameter_id: "f",
              target: ["dimension", ["field", PRODUCTS.TITLE, null]],
            },
            {
              card_id: 123,
              parameter_id: "g",
              target: ["dimension", ["field", PRODUCTS.TITLE, null]],
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
                    dimension: ["field", PRODUCTS.TITLE, null],
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
              target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
            },
            {
              card_id: 999,
              parameter_id: "h",
              target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
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
      const questions = Object.fromEntries(
        dashboard.dashcards.map(dashcard => {
          return [dashcard.id, new Question(dashcard.card, metadata)];
        }),
      );

      expect(
        getDashboardUiParameters(
          dashboard.dashcards,
          dashboard.parameters,
          metadata,
          questions,
        ),
      ).toEqual([
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
          hasVariableTemplateTagTarget: false,
        },
        {
          id: "d",
          slug: "slug-d",
          type: "number/=",
          default: [1, 2, 3],
          fields: [expect.any(Field)],
          hasVariableTemplateTagTarget: false,
        },
        {
          id: "e",
          slug: "slug-e",
          type: "category",
          fields: [],
          hasVariableTemplateTagTarget: true,
        },
        {
          id: "f",
          slug: "slug-f",
          type: "string/contains",
          fields: [expect.any(Field)],
          hasVariableTemplateTagTarget: false,
        },
        {
          id: "g",
          slug: "slug-g",
          type: "string/starts-with",
          fields: [expect.any(Field), expect.any(Field)],
          hasVariableTemplateTagTarget: false,
        },
        {
          id: "h",
          slug: "slug-h",
          type: "string/=",
          fields: [expect.any(Field)],
          hasVariableTemplateTagTarget: true,
        },
      ]);
    });
  });
});
