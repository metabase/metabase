import {
  fieldRefForColumn,
  syncTableColumnsToQuery,
  findColumnForColumnSetting,
  keyForColumn,
} from "metabase/lib/dataset";

import { ORDERS, PRODUCTS } from "__support__/sample_dataset_fixture";

describe("metabase/util/dataset", () => {
  describe("fieldRefForColumn", () => {
    it("should return field_ref from the column", () => {
      expect(fieldRefForColumn({ field_ref: ["field-id", 42] })).toEqual([
        "field-id",
        42,
      ]);
    });
  });

  describe("syncTableColumnsToQuery", () => {
    it("should not modify `fields` if no `table.columns` setting preset", () => {
      const question = syncTableColumnsToQuery(
        ORDERS.query({
          fields: [["field-id", ORDERS.TOTAL.id]],
        }).question(),
      );
      expect(question.query().query()).toEqual({
        "source-table": ORDERS.id,
        fields: [["field-id", ORDERS.TOTAL.id]],
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
        fields: [["field-id", ORDERS.TOTAL.id]],
      });
    });
    it("should sync included `table.columns` by fieldRef", () => {
      const question = syncTableColumnsToQuery(
        ORDERS.query()
          .question()
          .setSettings({
            "table.columns": [
              {
                fieldRef: ["field-id", ORDERS.TOTAL.id],
                enabled: true,
              },
            ],
          }),
      );
      expect(question.query().query()).toEqual({
        "source-table": ORDERS.id,
        fields: [["field-id", ORDERS.TOTAL.id]],
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
                ["joined-field", "products", ["field-id", PRODUCTS.PRICE.id]],
              ],
            },
          ],
          fields: [["field-id", ORDERS.TOTAL.id]],
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
                  fieldRef: ["field-id", ORDERS.TOTAL.id],
                  enabled: true,
                },
                {
                  fieldRef: [
                    "joined-field",
                    "products",
                    ["field-id", PRODUCTS.PRICE.id],
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
                ["joined-field", "products", ["field-id", PRODUCTS.PRICE.id]],
              ],
            },
          ],
          fields: [["field-id", ORDERS.TOTAL.id]],
        });
      });
    });
  });

  describe("findColumnForColumnSetting", () => {
    const columns = [
      { name: "bar", field_ref: ["field-id", 42] },
      { name: "foo", field_ref: ["fk->", ["field-id", 2], ["field-id", 1]] },
      { name: "baz", field_ref: ["field-id", 43] },
    ];
    it("should find column with name", () => {
      const column = findColumnForColumnSetting(columns, { name: "foo" });
      expect(column).toBe(columns[1]);
    });
    it("should find column with normalized fieldRef", () => {
      const column = findColumnForColumnSetting(columns, {
        fieldRef: ["fk->", ["field-id", 2], ["field-id", 1]],
      });
      expect(column).toBe(columns[1]);
    });
    it("should find column with non-normalized fieldRef", () => {
      const column = findColumnForColumnSetting(columns, {
        fieldRef: ["fk->", 2, 1], // deprecated
      });
      expect(column).toBe(columns[1]);
    });
  });

  describe("keyForColumn", () => {
    // NOTE: run legacy tests with and without a field_ref. without is disabled in latest since it now always uses
    // field_ref, leaving test code in place to compare against older versions
    for (const fieldRefEnabled of [/*false,*/ true]) {
      describe(fieldRefEnabled ? "with field_ref" : "without field_ref", () => {
        it("should return [ref [field-id ...]] for field", () => {
          expect(
            keyForColumn({
              name: "foo",
              id: 1,
              field_ref: fieldRefEnabled ? ["field-id", 1] : undefined,
            }),
          ).toEqual(JSON.stringify(["ref", ["field-id", 1]]));
        });
        it("should return [ref [fk-> ...]] for foreign field", () => {
          expect(
            keyForColumn({
              name: "foo",
              id: 1,
              fk_field_id: 2,
              field_ref: fieldRefEnabled
                ? ["fk->", ["field-id", 2], ["field-id", 1]]
                : undefined,
            }),
          ).toEqual(
            JSON.stringify(["ref", ["fk->", ["field-id", 2], ["field-id", 1]]]),
          );
        });
        it("should return [ref [expression ...]] for expression", () => {
          expect(
            keyForColumn({
              name: "foo",
              expression_name: "foo",
              field_ref: fieldRefEnabled ? ["expression", "foo"] : undefined,
            }),
          ).toEqual(JSON.stringify(["ref", ["expression", "foo"]]));
        });
        it("should return [name ...] for aggregation", () => {
          const col = {
            name: "foo",
            source: "aggregation",
            field_ref: fieldRefEnabled ? ["aggregation", 0] : undefined,
          };
          expect(keyForColumn(col, [col])).toEqual(
            // NOTE: not ideal, matches existing behavior, but should be ["aggregation", 0]
            JSON.stringify(["name", "foo"]),
          );
        });
        it("should return [name ...] for field-literal", () => {
          const col = {
            name: "foo",
            id: ["field-literal", "foo", "type/Integer"],
            field_ref: fieldRefEnabled
              ? ["field-literal", "foo", "type/Integer"]
              : undefined,
          };
          expect(keyForColumn(col, [col])).toEqual(
            // NOTE: not ideal, matches existing behavior, but should be ["field-literal", "foo", "type/Integer"]
            JSON.stringify(["name", "foo"]),
          );
        });
        it("should return [name ...] for native query column", () => {
          expect(
            keyForColumn({
              name: "foo",
              field_ref: fieldRefEnabled
                ? ["field-literal", "foo", "type/Integer"]
                : undefined,
            }),
          ).toEqual(
            // NOTE: not ideal, matches existing behavior, but should be ["field-literal", "foo", "type/Integer"]
            JSON.stringify(["name", "foo"]),
          );
        });
      });
    }

    describe("with field_ref", () => {
      it("should return [ref [field-id ...]] for joined-field", () => {
        const col = {
          name: "foo",
          id: 1,
          field_ref: ["joined-field", "x", ["field-id", 1]],
        };
        expect(keyForColumn(col)).toEqual(
          // NOTE: not ideal, matches existing behavior, but should be ["joined-field", "x", ["field-id", 1]]
          JSON.stringify(["ref", ["field-id", 1]]),
        );
      });
    });
  });
});
