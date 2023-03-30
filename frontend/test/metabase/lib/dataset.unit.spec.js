import { ORDERS, PRODUCTS } from "__support__/sample_database_fixture";
import {
  fieldRefForColumn,
  syncTableColumnsToQuery,
  findColumnForColumnSetting,
} from "metabase-lib/queries/utils/dataset";

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
      const prevQuestion = PRODUCTS.query({
        aggregation: [["count"]],
        breakout: [PRODUCTS.CATEGORY.dimension().mbql()],
      })
        .question()
        .setSettings({
          "graph.metrics": ["count"],
        });

      const newQuestion = prevQuestion
        .query()
        .aggregate(["sum", PRODUCTS.PRICE.dimension().mbql()])
        .question()
        .syncColumnsAndSettings(prevQuestion);

      expect(newQuestion.setting("graph.metrics")).toMatchObject([
        "count",
        "sum",
      ]);
    });

    it("should automatically remove metrics from settings when an aggregrate column is removed", () => {
      const prevQuestion = PRODUCTS.query({
        aggregation: [["sum", PRODUCTS.PRICE.dimension().mbql()], ["count"]],
        breakout: [PRODUCTS.CATEGORY.dimension().mbql()],
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
      const prevQuestion = PRODUCTS.query({
        aggregation: [["sum", PRODUCTS.PRICE.dimension().mbql()], ["count"]],
        breakout: [PRODUCTS.CATEGORY.dimension().mbql()],
      })
        .question()
        .setSettings({
          "graph.metrics": ["count", "sum"],
        });

      const newQuestion = prevQuestion
        .query()
        .breakout(PRODUCTS.VENDOR.dimension().mbql())
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
        ORDERS.query({
          fields: [["field", ORDERS.TOTAL.id, null]],
        }).question(),
      );
      expect(question.query().query()).toEqual({
        "source-table": ORDERS.id,
        fields: [["field", ORDERS.TOTAL.id, null]],
      });
    });
    it("should sync included `table.columns` by name", () => {
      const question = syncTableColumnsToQuery(
        ORDERS.query()
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
        "source-table": ORDERS.id,
        fields: [["field", ORDERS.TOTAL.id, null]],
      });
    });
    it("should sync included `table.columns` by fieldRef", () => {
      const question = syncTableColumnsToQuery(
        ORDERS.query()
          .question()
          .setSettings({
            "table.columns": [
              {
                fieldRef: ["field", ORDERS.TOTAL.id, null],
                enabled: true,
              },
            ],
          }),
      );
      expect(question.query().query()).toEqual({
        "source-table": ORDERS.id,
        fields: [["field", ORDERS.TOTAL.id, null]],
      });
    });
    it("should not modify columns if all default columns are enabled", () => {
      const query = ORDERS.query();
      const question = syncTableColumnsToQuery(
        query.question().setSettings({
          "table.columns": query.columnNames().map(name => ({
            name,
            enabled: true,
          })),
        }),
      );
      expect(question.query().query()).toEqual({
        "source-table": ORDERS.id,
      });
    });

    describe("with joins", () => {
      it("should sync included `table.columns` by name to join clauses", () => {
        const question = syncTableColumnsToQuery(
          ORDERS.query()
            .join({
              alias: "products",
              fields: "all",
              "source-table": PRODUCTS.id,
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
          "source-table": ORDERS.id,
          joins: [
            {
              alias: "products",
              "source-table": PRODUCTS.id,
              fields: [
                ["field", PRODUCTS.PRICE.id, { "join-alias": "products" }],
              ],
            },
          ],
          fields: [["field", ORDERS.TOTAL.id, null]],
        });
      });
      it("should sync included `table.columns` by fieldRef to join clauses", () => {
        const question = syncTableColumnsToQuery(
          ORDERS.query()
            .join({
              alias: "products",
              fields: "all",
              "source-table": PRODUCTS.id,
            })
            .question()
            .setSettings({
              "table.columns": [
                {
                  fieldRef: ["field", ORDERS.TOTAL.id, null],
                  enabled: true,
                },
                {
                  fieldRef: [
                    "field",
                    PRODUCTS.PRICE.id,
                    { "join-alias": "products" },
                  ],
                  enabled: true,
                },
              ],
            }),
        );
        expect(question.query().query()).toEqual({
          "source-table": ORDERS.id,
          joins: [
            {
              alias: "products",
              "source-table": PRODUCTS.id,
              fields: [
                ["field", PRODUCTS.PRICE.id, { "join-alias": "products" }],
              ],
            },
          ],
          fields: [["field", ORDERS.TOTAL.id, null]],
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
