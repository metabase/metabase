import {
  metadata,
  SAMPLE_DATASET,
  REVIEWS,
  ORDERS,
  PRODUCTS,
} from "__support__/sample_dataset_fixture";
import { getParameterMappingOptions } from "metabase/meta/Dashboard";

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
          target: ["dimension", ["field", 1, { "join-alias": "Joined Table" }]],
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
