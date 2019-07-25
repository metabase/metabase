import {
  fieldRefForColumn,
  syncTableColumnsToQuery,
} from "metabase/lib/dataset";

import {
  makeStructuredQuery,
  ORDERS_TOTAL_FIELD_ID,
} from "__support__/sample_dataset_fixture";

const FIELD_COLUMN = { id: 1 };
const FK_COLUMN = { id: 1, fk_field_id: 2 };
const EXPRESSION_COLUMN = { expression_name: "foo" };
const AGGREGATION_COLUMN = { source: "aggregation" };

describe("metabase/util/dataset", () => {
  describe("fieldRefForColumn", () => {
    it('should return `["field-id", 1]` for a normal column', () => {
      expect(fieldRefForColumn(FIELD_COLUMN)).toEqual(["field-id", 1]);
    });
    it('should return `["fk->", 2, 1]` for a fk column', () => {
      expect(fieldRefForColumn(FK_COLUMN)).toEqual(["fk->", 2, 1]);
    });
    it('should return `["expression", 2, 1]` for a fk column', () => {
      expect(fieldRefForColumn(EXPRESSION_COLUMN)).toEqual([
        "expression",
        "foo",
      ]);
    });

    describe("aggregation column", () => {
      // this is an unfortunate effect of the backend not returning enough information to determine the aggregation index from the column
      it("should return `null` for aggregation column if list of columns was provided", () => {
        expect(fieldRefForColumn(AGGREGATION_COLUMN)).toEqual(null);
      });
      it('should return `["aggregation", 0]` for aggregation column if list of columns was provided', () => {
        expect(
          fieldRefForColumn(AGGREGATION_COLUMN, [AGGREGATION_COLUMN]),
        ).toEqual(["aggregation", 0]);
      });
      it('should return `["aggregation", 1]` for second aggregation column if list of columns was provided', () => {
        expect(
          fieldRefForColumn(AGGREGATION_COLUMN, [
            { source: "aggregation" },
            AGGREGATION_COLUMN,
          ]),
        ).toEqual(["aggregation", 1]);
      });
    });

    // NOTE: sometimes id is an MBQL clause itself, e.x. nested queries
    it("should return `id` if is an MBQL clause", () => {
      expect(fieldRefForColumn({ id: ["field-id", 3] })).toEqual([
        "field-id",
        3,
      ]);
    });
  });

  describe("syncTableColumnsToQuery", () => {
    it("should not modify `fields` if no `table.columns` setting preset", () => {
      const question = syncTableColumnsToQuery(
        makeStructuredQuery({
          fields: [["field-id", ORDERS_TOTAL_FIELD_ID]],
        }).question(),
      );
      expect(question.query().query()).toEqual({
        "source-table": 1,
        fields: [["field-id", ORDERS_TOTAL_FIELD_ID]],
      });
    });
    it("should sync included `table.columns` by name", () => {
      const question = syncTableColumnsToQuery(
        makeStructuredQuery()
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
        "source-table": 1,
        fields: [["field-id", ORDERS_TOTAL_FIELD_ID]],
      });
    });
    it("should sync included `table.columns` by fieldRef", () => {
      const question = syncTableColumnsToQuery(
        makeStructuredQuery()
          .question()
          .setSettings({
            "table.columns": [
              {
                fieldRef: ["field-id", ORDERS_TOTAL_FIELD_ID],
                enabled: true,
              },
            ],
          }),
      );
      expect(question.query().query()).toEqual({
        "source-table": 1,
        fields: [["field-id", ORDERS_TOTAL_FIELD_ID]],
      });
    });
    it("should not modify columns if all default columns are enabled", () => {
      const query = makeStructuredQuery();
      const question = syncTableColumnsToQuery(
        query.question().setSettings({
          "table.columns": query.columnNames().map(name => ({
            name,
            enabled: true,
          })),
        }),
      );
      expect(question.query().query()).toEqual({
        "source-table": 1,
      });
    });
  });
});
