import { createMockMetadata } from "__support__/metadata";
import {
  createParameter,
  getFilteringParameterValuesMap,
  getUnsavedDashboardUiParameters,
  hasMapping,
  hasMatchingParameters,
  setParameterName,
} from "metabase/parameters/utils/dashboards";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import Field from "metabase-lib/v1/metadata/Field";
import { createMockUiParameter } from "metabase-lib/v1/parameters/mock";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type { Parameter } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockParameter,
  createMockParameterMapping,
} from "metabase-types/api/mocks";
import {
  PRODUCTS,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

describe("metabase/parameters/utils/dashboards", () => {
  describe("createParameter", () => {
    it("should create a new parameter using the given parameter options", () => {
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

    it("should prevent a duplicate name", () => {
      const parameter1 = createParameter({
        name: "foo bar",
        type: "category",
        sectionId: "abc",
      });

      const parameter2 = createParameter(
        {
          name: "foo bar",
          type: "category",
          sectionId: "abc",
        },
        [parameter1],
      );

      expect(parameter2).toEqual({
        id: expect.any(String),
        name: "foo bar 1",
        sectionId: "abc",
        slug: "foo_bar_1",
        type: "category",
      });

      const parameter3 = createParameter(
        {
          name: "foo bar",
          type: "category",
          sectionId: "abc",
        },
        [parameter1, parameter2],
      );

      expect(parameter3).toEqual({
        id: expect.any(String),
        name: "foo bar 2",
        sectionId: "abc",
        slug: "foo_bar_2",
        type: "category",
      });
    });
  });

  describe("setParameterName", () => {
    it("should set a name and a slug on parameter", () => {
      expect(
        // @ts-expect-error: extra options like abc are preserved
        setParameterName(createMockParameter({ abc: 123 }), "foo"),
      ).toEqual({
        id: expect.any(String),
        type: expect.any(String),
        abc: 123,
        name: "foo",
        slug: "foo",
      });
    });

    it("should not default", () => {
      expect(setParameterName(createMockParameter(), "")).toEqual({
        id: expect.any(String),
        type: expect.any(String),
        name: "",
        slug: "",
      });
    });
  });

  describe("hasMapping", () => {
    const parameter = createMockParameter({ id: "foo" });

    it("should return false when there are no cards on the dashboard", () => {
      const dashboard = createMockDashboard({
        dashcards: [],
      });
      expect(hasMapping(parameter, dashboard)).toBe(false);
    });

    it("should return false when there are no cards with parameter mappings", () => {
      const dashboard = createMockDashboard({
        dashcards: [
          createMockDashboardCard({
            parameter_mappings: [],
          }),
          createMockDashboardCard({
            parameter_mappings: [],
          }),
        ],
      });

      expect(hasMapping(parameter, dashboard)).toBe(false);
    });

    it("should return false when missing parameter mappings", () => {
      const dashboard = createMockDashboard({
        dashcards: [createMockDashboardCard({ parameter_mappings: undefined })],
      });
      expect(hasMapping(parameter, dashboard)).toBe(false);
    });

    it("should return false when there are no matching parameter mapping parameter_ids", () => {
      const dashboard = createMockDashboard({
        dashcards: [
          createMockDashboardCard({
            parameter_mappings: [
              createMockParameterMapping({
                parameter_id: "bar",
              }),
            ],
          }),
          createMockDashboardCard({
            parameter_mappings: [
              createMockParameterMapping({
                parameter_id: "baz",
              }),
              createMockParameterMapping({
                parameter_id: "abc",
              }),
            ],
          }),
        ],
      });

      expect(hasMapping(parameter, dashboard)).toBe(false);
    });

    it("should return true when the given parameter's id is found in a parameter_mappings object", () => {
      const dashboard = createMockDashboard({
        dashcards: [
          createMockDashboardCard({
            parameter_mappings: [
              createMockParameterMapping({
                parameter_id: "bar",
              }),
            ],
          }),
          createMockDashboardCard({
            parameter_mappings: [
              createMockParameterMapping({
                parameter_id: "baz",
              }),
              createMockParameterMapping({
                parameter_id: "foo",
              }),
            ],
          }),
        ],
      });

      expect(hasMapping(parameter, dashboard)).toBe(true);
    });
  });

  describe("hasMatchingParameters", () => {
    it("should return false when the given card is not found on the dashboard", () => {
      const dashboard = createMockDashboard({
        dashcards: [
          createMockDashboardCard({
            id: 1,
            card_id: 123,
            card: createMockCard({ id: 123 }),
            parameter_mappings: [
              createMockParameterMapping({
                card_id: 123,
                parameter_id: "foo",
              }),
            ],
          }),
        ],
      });

      expect(
        hasMatchingParameters({
          dashboard,
          dashcardId: 1,
          cardId: 456,
          parameters: [],
        }),
      ).toBe(false);

      expect(
        hasMatchingParameters({
          dashboard,
          dashcardId: 2,
          cardId: 123,
          parameters: [],
        }),
      ).toBe(false);
    });

    it("should return false when a given parameter is not found in the dashcard mappings", () => {
      const dashboard = createMockDashboard({
        dashcards: [
          createMockDashboardCard({
            id: 1,
            card_id: 123,
            card: createMockCard({ id: 123 }),
            parameter_mappings: [
              createMockParameterMapping({
                card_id: 123,
                parameter_id: "foo",
              }),
            ],
          }),
          createMockDashboardCard({
            id: 2,
            card_id: 456,
            card: createMockCard({ id: 456 }),
            parameter_mappings: [
              createMockParameterMapping({
                card_id: 456,
                parameter_id: "bar",
              }),
            ],
          }),
        ],
      });

      expect(
        hasMatchingParameters({
          dashboard,
          dashcardId: 1,
          cardId: 123,
          parameters: [
            createMockParameter({
              id: "foo",
            }),
            createMockParameter({
              id: "bar",
            }),
          ],
        }),
      ).toBe(false);
    });

    it("should return true when all given parameters are found mapped to the dashcard", () => {
      const dashboard = createMockDashboard({
        dashcards: [
          createMockDashboardCard({
            id: 1,
            card_id: 123,
            card: createMockCard({ id: 123 }),
            parameter_mappings: [
              createMockParameterMapping({
                card_id: 123,
                parameter_id: "foo",
              }),
              createMockParameterMapping({
                card_id: 123,
                parameter_id: "bar",
              }),
            ],
          }),
        ],
      });

      expect(
        hasMatchingParameters({
          dashboard,
          dashcardId: 1,
          cardId: 123,
          parameters: [
            createMockParameter({
              id: "foo",
            }),
            createMockParameter({
              id: "bar",
            }),
          ],
        }),
      ).toBe(true);
    });
  });

  describe("getFilteringParameterValuesMap", () => {
    const undefinedFilteringParameters = {} as UiParameter;
    const emptyFilteringParameters = createMockUiParameter({
      filteringParameters: [],
    });

    const parameter = createMockUiParameter({
      filteringParameters: ["a", "b", "c", "d"],
    });
    const parameters: Parameter[] = [
      createMockParameter({
        id: "a",
        value: "aaa",
      }),
      createMockParameter({
        id: "b",
        value: "bbb",
      }),
      createMockParameter({
        id: "c",
      }),
      createMockParameter({
        id: "d",
        value: null,
      }),
      createMockParameter({
        id: "e",
        value: "eee",
      }),
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
    const dashboard = createMockDashboard({
      id: 1,
      dashcards: [
        createMockDashboardCard({
          id: 1,
          card_id: 123,
          card: createMockCard({ id: 123 }),
          series: [createMockCard({ id: 789 })],
          parameter_mappings: [
            {
              card_id: 123,
              parameter_id: "b",
              target: ["dimension", ["field", PRODUCTS.RATING, null]],
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
        }),
        createMockDashboardCard({
          id: 2,
          card_id: 456,
          card: createMockCard({
            id: 456,
            dataset_query: Lib.toJsQuery(
              Lib.createTestNativeQuery(SAMPLE_PROVIDER, {
                query: "{{foo}}",
                templateTags: {
                  foo: {
                    type: "text",
                  },
                  bar: {
                    type: "dimension",
                    "widget-type": "string/contains",
                    dimension: PRODUCTS.TITLE,
                  },
                },
              }),
            ),
          }),
          parameter_mappings: [
            createMockParameterMapping({
              card_id: 456,
              parameter_id: "e",
            }),
            createMockParameterMapping({
              card_id: 456,
              parameter_id: "f",
              target: ["dimension", ["template-tag", "bar"]],
            }),
            createMockParameterMapping({
              card_id: 456,
              parameter_id: "h",
              target: ["variable", ["template-tag", "foo"]],
            }),
          ],
        }),
        createMockDashboardCard({
          id: 3,
          card_id: 999,
          card: createMockCard({ id: 999 }),
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
        }),
        createMockDashboardCard({
          id: 4,
          card_id: 888,
          card: createMockCard({ id: 888 }),
          parameter_mappings: [],
        }),
      ],
      parameters: [
        // unmapped, not field filter
        createMockParameter({
          id: "a",
          name: "a",
          slug: "slug-a",
          type: "foo",
        }),
        // mapped, not field filter
        createMockParameter({
          id: "b",
          name: "b",
          slug: "slug-b",
          type: "granularity",
          default: ["day"],
        }),
        // unmapped, field filter
        createMockParameter({
          id: "c",
          name: "c",
          slug: "slug-c",
          type: "string/=",
        }),
        // mapped, field filter
        createMockParameter({
          id: "d",
          name: "d",
          slug: "slug-d",
          type: "number/=",
          default: [1, 2, 3],
        }),
        // mapped to variable, field filter
        createMockParameter({
          id: "e",
          name: "e",
          slug: "slug-e",
          type: "category",
        }),
        // field filter, mapped to two cards, same field
        createMockParameter({
          id: "f",
          name: "f",
          slug: "slug-f",
          type: "string/contains",
        }),
        // field filter, mapped to two, different fields
        createMockParameter({
          id: "g",
          name: "g",
          slug: "slug-g",
          type: "string/starts-with",
        }),
        // field filter, mapped to field and variable
        createMockParameter({
          id: "h",
          name: "h",
          slug: "slug-h",
          type: "string/=",
        }),
      ],
    });

    it("should return a list of UiParameter objects from the given dashboard", () => {
      const questions = Object.fromEntries(
        dashboard.dashcards.map((dashcard) => {
          return [dashcard.id, new Question(dashcard.card, metadata)];
        }),
      );

      expect(
        getUnsavedDashboardUiParameters(
          dashboard.dashcards,
          dashboard.parameters,
          metadata,
          questions,
        ),
      ).toEqual([
        {
          id: "a",
          name: "a",
          slug: "slug-a",
          type: "foo",
        },
        {
          id: "b",
          name: "b",
          slug: "slug-b",
          type: "granularity",
          default: ["day"],
        },
        {
          id: "c",
          name: "c",
          slug: "slug-c",
          type: "string/=",
          fields: [],
          hasVariableTemplateTagTarget: false,
        },
        {
          id: "d",
          name: "d",
          slug: "slug-d",
          type: "number/=",
          default: [1, 2, 3],
          fields: [expect.any(Field)],
          hasVariableTemplateTagTarget: false,
        },
        {
          id: "e",
          name: "e",
          slug: "slug-e",
          type: "category",
          fields: [],
          hasVariableTemplateTagTarget: true,
        },
        {
          id: "f",
          name: "f",
          slug: "slug-f",
          type: "string/contains",
          fields: [expect.any(Field)],
          hasVariableTemplateTagTarget: false,
        },
        {
          id: "g",
          name: "g",
          slug: "slug-g",
          type: "string/starts-with",
          fields: [expect.any(Field), expect.any(Field)],
          hasVariableTemplateTagTarget: false,
        },
        {
          id: "h",
          name: "h",
          slug: "slug-h",
          type: "string/=",
          fields: [expect.any(Field)],
          hasVariableTemplateTagTarget: true,
        },
      ]);
    });
  });
});
