import { createMockMetadata } from "__support__/metadata";
import {
  createSampleDatabase,
  PRODUCTS,
  PRODUCTS_ID,
} from "metabase-types/api/mocks/presets";
import { createMockTableColumnOrderSetting } from "metabase-types/api/mocks";
import {
  fieldRefForColumn,
  findColumnForColumnSetting,
} from "metabase-lib/queries/utils/dataset";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

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
        .legacyQuery({
          aggregation: [["count"]],
          breakout: [["field", PRODUCTS.CATEGORY, null]],
        })
        .question()
        .setSettings({
          "graph.metrics": ["count"],
        });

      const newQuestion = prevQuestion
        .legacyQuery()
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
        .legacyQuery({
          aggregation: [["sum", ["field", PRODUCTS.PRICE, null]], ["count"]],
          breakout: [["field", PRODUCTS.CATEGORY, null]],
        })
        .question()
        .setSettings({
          "graph.metrics": ["count", "sum"],
        });

      const newQuestion = prevQuestion
        .legacyQuery()
        .removeAggregation(1)
        .question()
        .syncColumnsAndSettings(prevQuestion);

      expect(newQuestion.setting("graph.metrics")).toMatchObject(["sum"]);
    });

    it("Adding a breakout should not affect graph.metrics", () => {
      const prevQuestion = productsTable
        .legacyQuery({
          aggregation: [["sum", ["field", PRODUCTS.PRICE, null]], ["count"]],
          breakout: [["field", PRODUCTS.CATEGORY, null]],
        })
        .question()
        .setSettings({
          "graph.metrics": ["count", "sum"],
        });

      const newQuestion = prevQuestion
        .legacyQuery()
        .breakout(["field", PRODUCTS.VENDOR, null])
        .question()
        .syncColumnsAndSettings(prevQuestion);

      expect(newQuestion.setting("graph.metrics")).toMatchObject([
        "count",
        "sum",
      ]);
      expect(newQuestion.legacyQuery().columns()).toHaveLength(4);
    });

    it("removes columns from table.columns when a column is removed from a query", () => {
      const prevQuestion = productsTable
        .legacyQuery({
          fields: [
            ["field", PRODUCTS.ID, null],
            ["field", PRODUCTS.CATEGORY, null],
            ["field", PRODUCTS.VENDOR, null],
          ],
        })
        .question()
        .setSettings({
          "table.columns": [
            createMockTableColumnOrderSetting({
              name: "ID",
              fieldRef: ["field", PRODUCTS.ID, null],
              enabled: true,
            }),
            createMockTableColumnOrderSetting({
              name: "CATEGORY",
              fieldRef: ["field", PRODUCTS.CATEGORY, null],
              enabled: true,
            }),
            createMockTableColumnOrderSetting({
              name: "VENDOR",
              fieldRef: ["field", PRODUCTS.VENDOR, null],
              enabled: true,
            }),
          ],
        });

      const newQuestion = prevQuestion
        .legacyQuery()
        .removeField(2)
        .question()
        .syncColumnsAndSettings(prevQuestion);

      expect(prevQuestion.setting("table.columns")).toHaveLength(3);
      expect(newQuestion.setting("table.columns")).toEqual(
        prevQuestion.setting("table.columns").slice(0, 2),
      );
    });

    it("adds columns to table.columns when a column is added to a query", () => {
      const prevQuestion = productsTable
        .legacyQuery({
          fields: [
            ["field", PRODUCTS.ID, null],
            ["field", PRODUCTS.CATEGORY, null],
          ],
        })
        .question()
        .setSettings({
          "table.columns": [
            createMockTableColumnOrderSetting({
              name: "ID",
              fieldRef: ["field", PRODUCTS.ID, null],
              enabled: true,
            }),
            createMockTableColumnOrderSetting({
              name: "CATEGORY",
              fieldRef: ["field", PRODUCTS.CATEGORY, null],
              enabled: true,
            }),
          ],
        });

      const newQuestion = prevQuestion
        .legacyQuery()
        .addField(["field", PRODUCTS.VENDOR, null])
        .question()
        .syncColumnsAndSettings(prevQuestion);

      expect(prevQuestion.setting("table.columns")).toHaveLength(2);
      expect(newQuestion.setting("table.columns")).toEqual([
        ...prevQuestion.setting("table.columns"),
        createMockTableColumnOrderSetting({
          name: "VENDOR",
          fieldRef: ["field", PRODUCTS.VENDOR, null],
          enabled: true,
        }),
      ]);
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
