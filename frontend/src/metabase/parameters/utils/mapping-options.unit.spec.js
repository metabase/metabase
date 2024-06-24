import { createMockMetadata } from "__support__/metadata";
import Question from "metabase-lib/v1/Question";
import {
  createMockCard,
  createMockNativeDatasetQuery,
  createMockParameter,
  createMockTable,
} from "metabase-types/api/mocks";
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
  PEOPLE,
  createOrdersTable,
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
    describe("structured model", () => {
      let dataset;
      let virtualCardTable;
      beforeEach(() => {
        const question = ordersTable.question();
        dataset = question.setCard({
          ...question.card(),
          id: 123,
          type: "model",
        });

        // create a virtual table for the card
        // that contains fields with custom, model-specific metadata
        virtualCardTable = ordersTable.clone();
        virtualCardTable.id = `card__123`;
        virtualCardTable.fields = [
          metadata.field(ORDERS.CREATED_AT).clone({
            table_id: `card__123`,
            uniqueId: `card__123:${ORDERS.CREATED_AT}`,
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
          new Question(dataset.card(), metadata),
          { type: "date/single" },
          dataset.card(),
        );

        expect(options).toEqual([
          {
            icon: "calendar",
            isForeign: false,
            name: "~*~Created At~*~",
            sectionName: "Order",
            target: [
              "dimension",
              ["field", "CREATED_AT", { "base-type": "type/DateTime" }],
            ],
          },
        ]);
      });
    });

    describe("native model", () => {
      it("should not return mapping options for native models", () => {
        const card = createMockCard({
          type: "model",
          dataset_query: createMockNativeDatasetQuery({
            native: {
              query: "SELECT * FROM ORDERS",
            },
          }),
        });
        const table = createOrdersTable();
        const metadata = createMockMetadata({
          databases: [createSampleDatabase()],
          tables: [
            createMockTable({
              id: `card__${card.id}`,
              fields: (table.fields ?? []).map(field => ({
                ...field,
                table_id: `card__${card.id}`,
              })),
            }),
          ],
          questions: [card],
        });
        const question = new Question(card, metadata);
        const parameter = createMockParameter({ type: "number/=" });

        const options = getParameterMappingOptions(question, parameter, card);
        expect(options).toHaveLength(0);
      });
    });

    describe("structured query", () => {
      it("should return field-id and fk-> dimensions", () => {
        const card = structured({
          "source-table": REVIEWS_ID,
        });
        const options = getParameterMappingOptions(
          new Question(card, metadata),
          { type: "date/single" },
          card,
        );
        expect(options).toEqual([
          {
            sectionName: "Review",
            icon: "calendar",
            name: "Created At",
            target: [
              "dimension",
              ["field", REVIEWS.CREATED_AT, { "base-type": "type/DateTime" }],
            ],
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
                {
                  "base-type": "type/DateTime",
                  "source-field": REVIEWS.PRODUCT_ID,
                },
              ],
            ],
            isForeign: true,
          },
        ]);
      });
      it("should also return fields from explicitly joined tables", () => {
        const card = structured({
          "source-table": ORDERS_ID,
          joins: [
            {
              alias: "Product",
              fields: "all",
              "source-table": PRODUCTS_ID,
              condition: [
                "=",
                [
                  "field",
                  ORDERS.PRODUCT_ID,
                  { "base-type": "type/BigInteger" },
                ],
                ["field", PRODUCTS.ID, { "base-type": "type/BigInteger" }],
              ],
            },
          ],
        });
        const options = getParameterMappingOptions(
          new Question(card, metadata),
          { type: "date/single" },
          card,
        );
        expect(options).toEqual([
          {
            sectionName: "Order",
            name: "Created At",
            icon: "calendar",
            target: [
              "dimension",
              ["field", ORDERS.CREATED_AT, { "base-type": "type/DateTime" }],
            ],
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
                { "base-type": "type/DateTime", "join-alias": "Product" },
              ],
            ],
            isForeign: true,
          },
          {
            sectionName: "User",
            name: "Birth Date",
            icon: "calendar",
            target: [
              "dimension",
              [
                "field",
                PEOPLE.BIRTH_DATE,
                {
                  "base-type": "type/Date",
                  "source-field": ORDERS.USER_ID,
                },
              ],
            ],
            isForeign: true,
          },
          {
            sectionName: "User",
            name: "Created At",
            icon: "calendar",
            target: [
              "dimension",
              [
                "field",
                PEOPLE.CREATED_AT,
                {
                  "base-type": "type/DateTime",
                  "source-field": ORDERS.USER_ID,
                },
              ],
            ],
            isForeign: true,
          },
        ]);
      });
      it("should return fields in nested query", () => {
        const card = structured({
          "source-query": {
            "source-table": PRODUCTS_ID,
          },
        });
        const options = getParameterMappingOptions(
          new Question(card, metadata),
          { type: "date/single" },
          card,
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

    describe("native query", () => {
      it("should return variables for non-dimension template-tags", () => {
        const card = native({
          query: "select * from ORDERS where CREATED_AT = {{created}}",
          "template-tags": {
            created: {
              type: "date",
              name: "created",
            },
          },
        });
        const options = getParameterMappingOptions(
          new Question(card, metadata),
          { type: "date/single" },
          card,
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
      const card = native({
        query: "select * from ORDERS where CREATED_AT = {{created}}",
        "template-tags": {
          created: {
            type: "dimension",
            name: "created",
            dimension: ["field", ORDERS.CREATED_AT, null],
          },
        },
      });
      const options = getParameterMappingOptions(
        new Question(card, metadata),
        { type: "date/single" },
        card,
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
