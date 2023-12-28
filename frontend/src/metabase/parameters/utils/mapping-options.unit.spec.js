import { createMockMetadata } from "__support__/metadata";
import {
  createSampleDatabase,
  createAdHocCard,
  createAdHocNativeCard,
  SAMPLE_DB_ID,
  ORDERS_ID,
  ORDERS,
  REVIEWS_ID,
  REVIEWS,
  PRODUCTS,
  PRODUCTS_ID,
} from "metabase-types/api/mocks/presets";

import { getParameterMappingOptions } from "./mapping-options";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const ordersTable = metadata.table(ORDERS_ID);

function structured(query) {
  return createAdHocCard({
    dataset_query: {
      type: "query",
      database: SAMPLE_DB_ID,
      query,
    },
  });
}

function native(native) {
  return createAdHocNativeCard({
    dataset_query: {
      type: "native",
      database: SAMPLE_DB_ID,
      native,
    },
  });
}

describe("parameters/utils/mapping-options", () => {
  describe("getParameterMappingOptions", () => {
    describe("Model question", () => {
      let dataset;
      let virtualCardTable;
      beforeEach(() => {
        const question = ordersTable.question();
        dataset = question
          .setCard({ ...question.card(), id: 123 })
          .setDataset(true);

        // create a virtual table for the card
        // that contains fields with custom, model-specific metadata
        virtualCardTable = ordersTable.clone();
        virtualCardTable.id = `card__123`;
        virtualCardTable.fields = [
          metadata.field(ORDERS.CREATED_AT).clone({
            table_id: `card__123`,
            uniqueId: `card__123:${ORDERS.CREATED_AT.id}`,
            display_name: "~*~Created At~*~",
          }),
        ];

        // add instances to the `metadata` instance
        metadata.questions[dataset.id()] = dataset;
        metadata.tables[virtualCardTable.id] = virtualCardTable;
        virtualCardTable.fields.forEach(f => {
          metadata.fields[f.uniqueId] = f;
        });
      });

      it("should return fields from the model question's virtual card table, as though it is already nested", () => {
        const options = getParameterMappingOptions(
          metadata,
          { type: "date/single" },
          dataset.card(),
        );

        expect(options).toEqual([
          {
            icon: "calendar",
            isForeign: false,
            name: "~*~Created At~*~",
            sectionName: "Order",
            target: ["dimension", ["field", ORDERS.CREATED_AT, null]],
          },
        ]);
      });
    });

    describe("Structured Query", () => {
      it("should return field-id and fk-> dimensions", () => {
        const options = getParameterMappingOptions(
          metadata,
          { type: "date/single" },
          structured({
            "source-table": REVIEWS_ID,
          }),
        );
        expect(options).toEqual([
          {
            sectionName: "Review",
            icon: "calendar",
            name: "Created At",
            target: ["dimension", ["field", REVIEWS.CREATED_AT, null]],
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
                PRODUCTS.CREATED_AT,
                { "source-field": REVIEWS.PRODUCT_ID },
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
            "source-table": REVIEWS_ID,
            joins: [
              {
                alias: "Joined Table",
                "source-table": ORDERS_ID,
              },
            ],
          }),
        );
        expect(options).toEqual([
          {
            sectionName: "Review",
            name: "Created At",
            icon: "calendar",
            target: ["dimension", ["field", REVIEWS.CREATED_AT, null]],
            isForeign: false,
          },
          {
            sectionName: "Joined Table",
            name: "Created At",
            icon: "calendar",
            target: [
              "dimension",
              ["field", ORDERS.CREATED_AT, { "join-alias": "Joined Table" }],
            ],
            isForeign: true,
          },
          {
            sectionName: "Product",
            name: "Created At",
            icon: "calendar",
            target: [
              "dimension",
              [
                "field",
                PRODUCTS.CREATED_AT,
                { "source-field": REVIEWS.PRODUCT_ID },
              ],
            ],
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
              "source-table": PRODUCTS_ID,
            },
          }),
        );
        expect(options).toEqual([
          {
            // this is a source query, and tables for source queries do not have a display_name
            sectionName: "",
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
              dimension: ["field", ORDERS.CREATED_AT, null],
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
});
