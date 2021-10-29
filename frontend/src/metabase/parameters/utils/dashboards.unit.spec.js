import {
  createParameter,
  setParameterName,
  setParameterDefaultValue,
  hasMapping,
  isDashboardParameterWithoutMapping,
  getMappingsByParameter,
} from "metabase/parameters/utils/dashboards";
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
        table() {},
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
              field: metadata.field(120),
              field_id: 120,
              parameter_id: "parameter1",
              target: ["dimension", ["field", 120, null]],
            },
          },
          "86": {
            "59": {
              card_id: 59,
              dashcard_id: 86,
              field: metadata.field(134),
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

      expect(mappings.parameter1["87"]["62"].field).toEqual(
        expect.objectContaining({
          name: "boolean",
        }),
      );
    });
  });
});
