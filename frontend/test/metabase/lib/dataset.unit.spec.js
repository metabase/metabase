import { createMockMetadata } from "__support__/metadata";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
} from "metabase-types/api/mocks/presets";
import {
  fieldRefForColumn,
  syncTableColumnsToQuery,
  findColumnForColumnSetting,
} from "metabase-lib/queries/utils/dataset";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const ordersTable = metadata.table(ORDERS_ID);
const productsTable = metadata.table(PRODUCTS_ID);

describe("metabase/util/dataset", () => {
  describe("fieldRefForColumn", () => {
    it("should return field_ref from the column", () => {
      expect(fieldRefForColumn({ field_ref: ["field", 42, null] })).toEqual([
        "field",
        42,
        null,
      ]);
    });
  });

  describe("syncColumnsAndSettings", () => {
    it("should automatically add new metrics when a new aggregrate column is added", () => {
      const prevQuestion = productsTable
        .query({
          aggregation: [["count"]],
          breakout: [["field", PRODUCTS.CATEGORY, null]],
        })
        .question()
        .setSettings({
          "graph.metrics": ["count"],
        });

      const newQuestion = prevQuestion
        .query()
        .aggregate(["sum", ["field", PRODUCTS.PRICE, null]])
        .question()
        .syncColumnsAndSettings(prevQuestion);

      expect(newQuestion.setting("graph.metrics")).toMatchObject([
        "count",
        "sum",
      ]);
    });

    it("should automatically remove metrics from settings when an aggregrate column is removed", () => {
      const prevQuestion = productsTable
        .query({
          aggregation: [["sum", ["field", PRODUCTS.PRICE, null]], ["count"]],
          breakout: [["field", PRODUCTS.CATEGORY, null]],
        })
        .question()
        .setSettings({
          "graph.metrics": ["count", "sum"],
        });

      const newQuestion = prevQuestion
        .query()
        .removeAggregation(1)
        .question()
        .syncColumnsAndSettings(prevQuestion);

      expect(newQuestion.setting("graph.metrics")).toMatchObject(["sum"]);
    });

    it("Adding a breakout should not affect graph.metrics", () => {
      const prevQuestion = productsTable
        .query({
          aggregation: [["sum", ["field", PRODUCTS.PRICE, null]], ["count"]],
          breakout: [["field", PRODUCTS.CATEGORY, null]],
        })
        .question()
        .setSettings({
          "graph.metrics": ["count", "sum"],
        });

      const newQuestion = prevQuestion
        .query()
        .breakout(["field", PRODUCTS.VENDOR, null])
        .question()
        .syncColumnsAndSettings(prevQuestion);

      expect(newQuestion.setting("graph.metrics")).toMatchObject([
        "count",
        "sum",
      ]);
      expect(newQuestion.query().columns()).toHaveLength(4);
    });
  });

  describe("syncTableColumnsToQuery", () => {
    it("should not modify `fields` if no `table.columns` setting preset", () => {
      const question = syncTableColumnsToQuery(
        ordersTable
          .query({
            fields: [["field", ["field", ORDERS.TOTAL, null], null]],
          })
          .question(),
      );
      expect(question.query().query()).toEqual({
        "source-table": ORDERS_ID,
        fields: [["field", ["field", ORDERS.TOTAL, null], null]],
      });
    });
    it("should sync included `table.columns` by name", () => {
      const question = syncTableColumnsToQuery(
        ordersTable
          .query()
          .question()
          .setSettings({
            "table.columns": [
              {
                name: "TOTAL",
                enabled: true,
              },
            ],
          }),
      );
      expect(question.query().query()).toEqual({
        "source-table": ORDERS_ID,
        fields: [["field", ORDERS.TOTAL, null]],
      });
    });
    it("should sync included `table.columns` by fieldRef", () => {
      const question = syncTableColumnsToQuery(
        ordersTable
          .query()
          .question()
          .setSettings({
            "table.columns": [
              {
                fieldRef: ["field", ORDERS.TOTAL, null],
                enabled: true,
              },
            ],
          }),
      );
      expect(question.query().query()).toEqual({
        "source-table": ORDERS_ID,
        fields: [["field", ORDERS.TOTAL, null]],
      });
    });
    it("should not modify columns if all default columns are enabled", () => {
      const query = ordersTable.query();
      const question = syncTableColumnsToQuery(
        query.question().setSettings({
          "table.columns": query.columnNames().map(name => ({
            name,
            enabled: true,
          })),
        }),
      );
      expect(question.query().query()).toEqual({
        "source-table": ORDERS_ID,
      });
    });

    describe("with joins", () => {
      it("should sync included `table.columns` by name to join clauses", () => {
        const question = syncTableColumnsToQuery(
          ordersTable
            .query()
            .join({
              alias: "products",
              fields: "all",
              "source-table": PRODUCTS_ID,
            })
            .question()
            .setSettings({
              "table.columns": [
                {
                  name: "TOTAL",
                  enabled: true,
                },
                {
                  name: "PRICE",
                  enabled: true,
                },
              ],
            }),
        );
        expect(question.query().query()).toEqual({
          "source-table": ORDERS_ID,
          joins: [
            {
              alias: "products",
              "source-table": PRODUCTS_ID,
              fields: [["field", PRODUCTS.PRICE, { "join-alias": "products" }]],
            },
          ],
          fields: [["field", ORDERS.TOTAL, null]],
        });
      });
      it("should sync included `table.columns` by fieldRef to join clauses", () => {
        const question = syncTableColumnsToQuery(
          ordersTable
            .query()
            .join({
              alias: "products",
              fields: "all",
              "source-table": PRODUCTS_ID,
            })
            .question()
            .setSettings({
              "table.columns": [
                {
                  fieldRef: ["field", ORDERS.TOTAL, null],
                  enabled: true,
                },
                {
                  fieldRef: [
                    "field",
                    PRODUCTS.PRICE,
                    { "join-alias": "products" },
                  ],
                  enabled: true,
                },
              ],
            }),
        );
        expect(question.query().query()).toEqual({
          "source-table": ORDERS_ID,
          joins: [
            {
              alias: "products",
              "source-table": PRODUCTS_ID,
              fields: [["field", PRODUCTS.PRICE, { "join-alias": "products" }]],
            },
          ],
          fields: [["field", ORDERS.TOTAL, null]],
        });
      });
    });
  });

  describe("findColumnForColumnSetting", () => {
    const columns = [
      { name: "bar", field_ref: ["field", 42, null] },
      { name: "foo", field_ref: ["field", 1, { "source-field": 2 }] },
      { name: "baz", field_ref: ["field", 43, null] },
    ];
    it("should find column with name", () => {
      const column = findColumnForColumnSetting(columns, { name: "foo" });
      expect(column).toBe(columns[1]);
    });
    it("should find column with normalized fieldRef", () => {
      const column = findColumnForColumnSetting(columns, {
        fieldRef: ["field", 1, { "source-field": 2 }],
      });
      expect(column).toBe(columns[1]);
    });
  });
});
