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
      expect(fieldRefForColumn({ field_ref: ["field", 42, null] })).toEqual([
        "field",
        42,
        null,
      ]);
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

  describe("keyForColumn", () => {
    // NOTE: run legacy tests with and without a field_ref. without is disabled in latest since it now always uses
    // field_ref, leaving test code in place to compare against older versions
    for (const fieldRefEnabled of [/*false,*/ true]) {
      describe(fieldRefEnabled ? "with field_ref" : "without field_ref", () => {
        it("should return [ref [field ...]] for field", () => {
          expect(
            keyForColumn({
              name: "foo",
              id: 1,
              field_ref: fieldRefEnabled ? ["field", 1, null] : undefined,
            }),
          ).toEqual(JSON.stringify(["ref", ["field", 1, null]]));
        });
        it("should return [ref [field ...]] for foreign field", () => {
          expect(
            keyForColumn({
              name: "foo",
              id: 1,
              fk_field_id: 2,
              field_ref: fieldRefEnabled
                ? ["field", 1, { "source-field": 2 }]
                : undefined,
            }),
          ).toEqual(
            JSON.stringify(["ref", ["field", 1, { "source-field": 2 }]]),
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
        it("should return [name ...] for aggregation", () => {
          const col = {
            name: "foo",
            id: ["field", "foo", { "base-type": "type/Integer" }],
            field_ref: fieldRefEnabled
              ? ["field", "foo", { "base-type": "type/Integer" }]
              : undefined,
          };
          expect(keyForColumn(col, [col])).toEqual(
            // NOTE: not ideal, matches existing behavior, but should be ["field", "foo", {"base-type": "type/Integer"}]
            JSON.stringify(["name", "foo"]),
          );
        });
        it("should return [field ...] for native query column", () => {
          expect(
            keyForColumn({
              name: "foo",
              field_ref: fieldRefEnabled
                ? ["field", "foo", { "base-type": "type/Integer" }]
                : undefined,
            }),
          ).toEqual(
            // NOTE: not ideal, matches existing behavior, but should be ["field", "foo", {"base-type": "type/Integer"}]
            JSON.stringify(["name", "foo"]),
          );
        });
      });
    }

    describe("with field_ref", () => {
      it("should return [ref [field ...]] for joined field", () => {
        const col = {
          name: "foo",
          id: 1,
          field_ref: ["field", 1, { "join-alias": "x" }],
        };
        expect(keyForColumn(col)).toEqual(
          // NOTE: not ideal, matches existing behavior, but should be ["field", 1, {"join-alias": "x"}]
          JSON.stringify(["ref", ["field", 1, null]]),
        );
      });
    });
  });
});
