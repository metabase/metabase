import {
  metadata,
  SAMPLE_DATASET,
  REVIEWS,
  ORDERS,
  PRODUCTS,
} from "__support__/sample_dataset_fixture";
import {
  getParameterMappingOptions,
  hasMapping,
  isDashboardParameterWithoutMapping,
  getMappingsByParameter,
} from "metabase/meta/Dashboard";
import DASHBOARD_WITH_BOOLEAN_PARAMETER from "./dashboard-with-boolean-parameter.json";

function structured(query) {
  return SAMPLE_DATASET.question(query).card();
  // return {
  //   dataset_query: {
  //     database: SAMPLE_DATASET.id,
  //     type: "query",
  //     query: query,
  //   },
  // };
}

function native(native) {
  return SAMPLE_DATASET.nativeQuestion(native).card();
  // return {
  //   dataset_query: {
  //     database: SAMPLE_DATASET.id,
  //     type: "native",
  //     native: native,
  //   },
  // };
}

describe("meta/Dashboard", () => {
  describe("getParameterMappingOptions", () => {
    describe("Structured Query", () => {
      it("should return field-id and fk-> dimensions", () => {
        const options = getParameterMappingOptions(
          metadata,
          { type: "date/single" },
          structured({
            "source-table": REVIEWS.id,
          }),
        );
        expect(options).toEqual([
          {
            sectionName: "Review",
            icon: "calendar",
            name: "Created At",
            target: ["dimension", ["field", REVIEWS.CREATED_AT.id, null]],
            isForeign: false,
          },
          {
            sectionName: "Product",
            name: "Created At",
            icon: "calendar",
            target: [
              "dimension",
              [
                "field",
                PRODUCTS.CREATED_AT.id,
                { "source-field": REVIEWS.PRODUCT_ID.id },
              ],
            ],
            isForeign: true,
          },
        ]);
      });
      it("should also return fields from explicitly joined tables", () => {
        const options = getParameterMappingOptions(
          metadata,
          { type: "date/single" },
          structured({
            "source-table": REVIEWS.id,
            joins: [
              {
                alias: "Joined Table",
                "source-table": ORDERS.id,
              },
            ],
          }),
        );
        expect(options).toEqual([
          {
            sectionName: "Review",
            name: "Created At",
            icon: "calendar",
            target: ["dimension", ["field", 30, null]],
            isForeign: false,
          },
          {
            sectionName: "Joined Table",
            name: "Created At",
            icon: "calendar",
            target: [
              "dimension",
              ["field", 1, { "join-alias": "Joined Table" }],
            ],
            isForeign: true,
          },
          {
            sectionName: "Product",
            name: "Created At",
            icon: "calendar",
            target: ["dimension", ["field", 22, { "source-field": 32 }]],
            isForeign: true,
          },
        ]);
      });
      it("should return fields in nested query", () => {
        const options = getParameterMappingOptions(
          metadata,
          { type: "date/single" },
          structured({
            "source-query": {
              "source-table": ORDERS.id,
            },
          }),
        );
        expect(options).toEqual([
          {
            sectionName: null,
            name: "Created At",
            icon: "calendar",
            target: [
              "dimension",
              ["field", "CREATED_AT", { "base-type": "type/DateTime" }],
            ],
            isForeign: false,
          },
        ]);
      });
    });

    describe("NativeQuery", () => {
      it("should return variables for non-dimension template-tags", () => {
        const options = getParameterMappingOptions(
          metadata,
          { type: "date/single" },
          native({
            query: "select * from ORDERS where CREATED_AT = {{created}}",
            "template-tags": {
              created: {
                type: "date",
                name: "created",
              },
            },
          }),
        );
        expect(options).toEqual([
          {
            name: "created",
            icon: "calendar",
            target: ["variable", ["template-tag", "created"]],
            isForeign: false,
          },
        ]);
      });
    });
    it("should return dimensions for dimension template-tags", () => {
      const options = getParameterMappingOptions(
        metadata,
        { type: "date/single" },
        native({
          query: "select * from ORDERS where CREATED_AT = {{created}}",
          "template-tags": {
            created: {
              type: "dimension",
              name: "created",
              dimension: ["field", ORDERS.CREATED_AT.id, null],
            },
          },
        }),
      );
      expect(options).toEqual([
        {
          name: "Created At",
          icon: "calendar",
          target: ["dimension", ["template-tag", "created"]],
          isForeign: false,
        },
      ]);
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
          120: {
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
          },
          134: {
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
          },
        },
        field(id) {
          return this.fields[id];
        },
      };

      dashboard = DASHBOARD_WITH_BOOLEAN_PARAMETER;
    });

    it("should add a hasDisjointValueSets property", () => {
      metadata.fields[120].fieldValues = () => [
        ["a", undefined],
        ["b", undefined],
      ];
      metadata.fields[134].fieldValues = () => [["c", undefined]];

      expect(getMappingsByParameter(metadata, dashboard)).toEqual({
        parameter1: {
          "81": {
            "56": expect.objectContaining({
              hasDisjointValueSets: true,
            }),
          },
          "86": {
            "59": expect.objectContaining({
              hasDisjointValueSets: true,
            }),
          },
          "87": {
            "62": expect.not.objectContaining({
              hasDisjointValueSets: true,
            }),
          },
        },
      });
    });

    it("should not add hasDisjointValueSets when the fields do not have attached field values", () => {
      metadata.fields[134].fieldValues = () => [];

      expect(getMappingsByParameter(metadata, dashboard)).toEqual({
        parameter1: {
          "81": {
            "56": expect.not.objectContaining({
              hasDisjointValueSets: true,
            }),
          },
          "86": {
            "59": expect.not.objectContaining({
              hasDisjointValueSets: true,
            }),
          },
          "87": {
            "62": expect.not.objectContaining({
              hasDisjointValueSets: true,
            }),
          },
        },
      });
    });

    it("should add hasDisjointValueSets value of false when there is overlap between different field values", () => {
      metadata.fields[120].fieldValues = () => [
        ["a", undefined],
        ["b", undefined],
      ];
      metadata.fields[134].fieldValues = () => [
        ["c", undefined],
        ["a", undefined],
      ];

      expect(getMappingsByParameter(metadata, dashboard)).toEqual({
        parameter1: {
          "81": {
            "56": expect.objectContaining({
              hasDisjointValueSets: false,
            }),
          },
          "86": {
            "59": expect.objectContaining({
              hasDisjointValueSets: false,
            }),
          },
          "87": {
            "62": expect.not.objectContaining({
              hasDisjointValueSets: true,
            }),
          },
        },
      });
    });

    it("should handle remapped values by relying on original value", () => {
      metadata.fields[120].fieldValues = () => [
        ["a", "remapped value"],
        ["b", undefined],
      ];
      metadata.fields[134].fieldValues = () => [["a", undefined]];

      expect(getMappingsByParameter(metadata, dashboard)).toEqual({
        parameter1: {
          "81": {
            "56": expect.objectContaining({
              hasDisjointValueSets: false,
            }),
          },
          "86": {
            "59": expect.objectContaining({
              hasDisjointValueSets: false,
            }),
          },
          "87": {
            "62": expect.not.objectContaining({
              hasDisjointValueSets: true,
            }),
          },
        },
      });
    });

    it("should generate a map of parameter mappings with added field metadata", () => {
      expect(getMappingsByParameter(metadata, dashboard)).toEqual({
        parameter1: {
          "81": {
            "56": {
              card_id: 56,
              dashcard_id: 81,
              field: expect.objectContaining({
                base_type: "type/Boolean",
                has_field_values: "list",
                id: 120,
                name_field: null,
                semantic_type: null,
                table_id: 6,
              }),
              field_id: 120,
              parameter_id: "parameter1",
              target: ["dimension", ["field", 120, null]],
            },
          },
          "86": {
            "59": {
              card_id: 59,
              dashcard_id: 86,
              field: expect.objectContaining({
                base_type: "type/Boolean",
                has_field_values: "list",
                id: 134,
                name_field: null,
                semantic_type: "type/Category",
                table_id: 8,
              }),
              field_id: 134,
              parameter_id: "parameter1",
              target: ["dimension", ["template-tag", "bbb"]],
            },
          },
          "87": {
            "62": {
              card_id: 62,
              dashcard_id: 87,
              field: expect.objectContaining({
                _plainObject: {
                  base_type: "type/Boolean",
                  display_name: "boolean",
                  effective_type: "type/Boolean",
                  field_ref: [
                    "field",
                    "boolean",
                    { "base-type": "type/Boolean" },
                  ],
                  fingerprint: {
                    global: { "distinct-count": 3, "nil%": 0.25 },
                  },
                  name: "boolean",
                  semantic_type: null,
                },
                base_type: "type/Boolean",
                display_name: "boolean",
                effective_type: "type/Boolean",
                field_ref: [
                  "field",
                  "boolean",
                  { "base-type": "type/Boolean" },
                ],
                name: "boolean",
                semantic_type: null,
              }),
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
    });
  });
});
