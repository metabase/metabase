import {
  createParameter,
  setParameterName,
  setParameterDefaultValue,
  hasMapping,
  isDashboardParameterWithoutMapping,
  getMappingsByParameter,
  getParametersMappedToDashcard,
  hasMatchingParameters,
  getFilteringParameterValuesMap,
  getParameterValuesSearchKey,
  getMappingTargetField,
} from "metabase/parameters/utils/dashboards";
import { metadata } from "__support__/sample_database_fixture";

import DASHBOARD_WITH_BOOLEAN_PARAMETER from "./fixtures/dashboard-with-boolean-parameter.json";

import Field from "metabase-lib/lib/metadata/Field";

describe("meta/Dashboard", () => {
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

  describe("getMappingsByParameter", () => {
    let metadata;
    let dashboard;
    beforeEach(() => {
      metadata = {
        fields: {
          120: new Field({
            values: {
              values: [false, true],
              human_readable_values: [],
              field_id: 120,
            },
            id: 120,
            table_id: 6,
            display_name: "CouponUsed",
            base_type: "type/Boolean",
            semantic_type: null,
            has_field_values: "list",
            name_field: null,
            dimensions: {},
            fieldValues: () => [],
          }),
          134: new Field({
            values: {
              values: [false, true],
              human_readable_values: [],
              field_id: 134,
            },
            id: 134,
            table_id: 8,
            display_name: "Bool",
            base_type: "type/Boolean",
            semantic_type: "type/Category",
            has_field_values: "list",
            name_field: null,
            dimensions: {},
            fieldValues: () => [],
          }),
        },
        field(id) {
          return this.fields[id];
        },
        tables: {
          6: {
            id: 6,
          },
          8: {
            id: 8,
          },
        },
        table(id) {
          return this.tables[id];
        },
      };

      dashboard = DASHBOARD_WITH_BOOLEAN_PARAMETER;
    });

    it("should generate a map of parameter mappings with added field metadata", () => {
      const mappings = getMappingsByParameter(metadata, dashboard);

      expect(mappings).toEqual({
        parameter1: {
          "81": {
            "56": {
              card_id: 56,
              dashcard_id: 81,
              field: expect.any(Field),
              field_id: 120,
              parameter_id: "parameter1",
              target: ["dimension", ["field", 120, null]],
            },
          },
          "86": {
            "59": {
              card_id: 59,
              dashcard_id: 86,
              field: expect.any(Field),
              field_id: 134,
              parameter_id: "parameter1",
              target: ["dimension", ["template-tag", "bbb"]],
            },
          },
          "87": {
            "62": {
              card_id: 62,
              dashcard_id: 87,
              field: expect.any(Field),
              field_id: "boolean",
              parameter_id: "parameter1",
              target: [
                "dimension",
                ["field", "boolean", { "base-type": "type/Boolean" }],
              ],
            },
          },
        },
      });

      expect(mappings.parameter1["81"]["56"].field.getPlainObject()).toEqual(
        expect.objectContaining(metadata.field(120).getPlainObject()),
      );
      expect(mappings.parameter1["86"]["59"].field.getPlainObject()).toEqual(
        expect.objectContaining(metadata.field(134).getPlainObject()),
      );
      expect(mappings.parameter1["87"]["62"].field.getPlainObject()).toEqual(
        expect.objectContaining({
          name: "boolean",
        }),
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

    const dashboardWithNoParameters = {};

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
            parameter_mappings: [
              {
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
            parameter_mappings: [
              {
                parameter_id: "foo",
              },
            ],
          },
          {
            id: 2,
            card_id: 456,
            parameter_mappings: [
              {
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
            parameter_mappings: [
              {
                parameter_id: "foo",
              },
              {
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

  describe("getMappingTargetField", () => {
    const mapping = {
      parameter_id: "dbe38f17",
      card_id: 1,
      target: ["dimension", ["field", 4, null]],
    };

    const metadata = {
      field: jest.fn(),
    };

    it("should return null when not given a card", () => {
      expect(getMappingTargetField(null, mapping, metadata)).toBe(null);
    });

    it("should return null when given a card without a `dataset_query`", () => {
      const card = {
        id: 1,
      };

      expect(getMappingTargetField(card, mapping, metadata)).toBe(null);
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

      expect(getMappingTargetField(card, mapping, metadata)).toEqual(field);
    });
  });
});
