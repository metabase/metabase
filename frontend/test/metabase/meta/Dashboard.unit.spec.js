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
          target: ["dimension", ["field-id", REVIEWS.CREATED_AT.id]],
          isForeign: false,
        },
        {
          sectionName: "Product",
          name: "Created At",
          icon: "calendar",
          target: [
            "dimension",
            [
              "fk->",
              ["field-id", REVIEWS.PRODUCT_ID.id],
              ["field-id", PRODUCTS.CREATED_AT.id],
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
          target: ["dimension", ["field-id", 30]],
          isForeign: false,
        },
        {
          sectionName: "Joined Table",
          name: "Created At",
          icon: "calendar",
          target: [
            "dimension",
            ["joined-field", "Joined Table", ["field-id", 1]],
          ],
          isForeign: true,
        },
        {
          sectionName: "Product",
          name: "Created At",
          icon: "calendar",
          target: ["dimension", ["fk->", ["field-id", 32], ["field-id", 22]]],
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
          sectionName: undefined,
          name: "Created At",
          icon: "calendar",
          target: [
            "dimension",
            ["field-literal", "CREATED_AT", "type/DateTime"],
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
          sectionName: "Variables",
          name: "created",
          icon: "calendar",
          target: ["variable", ["template-tag", "created"]],
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
            dimension: ["field-id", ORDERS.CREATED_AT.id],
          },
        },
      }),
    );
    expect(options).toEqual([
      {
        sectionName: "Order",
        name: "Created At",
        icon: "calendar",
        target: ["dimension", ["template-tag", "created"]],
        isForeign: false,
      },
    ]);
  });
});
