import { createMockMetadata } from "__support__/metadata";
import { separateTablesBySchema } from "metabase/reference/databases/TableList";
import { databaseToForeignKeys, getQuestion } from "metabase/reference/utils";
import { TYPE } from "metabase-lib/v1/types/constants";
import {
  createMockDatabase,
  createMockField,
  createMockMetric,
  createMockSegment,
  createMockTable,
} from "metabase-types/api/mocks";

describe("Reference utils.js", () => {
  describe("databaseToForeignKeys()", () => {
    it("should build foreignKey viewmodels from database", () => {
      const database = {
        tables_lookup: {
          1: {
            id: 1,
            display_name: "foo",
            schema_name: "PUBLIC",
            fields: [
              {
                id: 1,
                semantic_type: TYPE.PK,
                display_name: "bar",
                description: "foobar",
              },
            ],
          },
          2: {
            id: 2,
            display_name: "bar",
            schema_name: "public",
            fields: [
              {
                id: 2,
                semantic_type: TYPE.PK,
                display_name: "foo",
                description: "barfoo",
              },
            ],
          },
          3: {
            id: 3,
            display_name: "boo",
            schema_name: "TEST",
            fields: [
              {
                id: 3,
                display_name: "boo",
                description: "booboo",
              },
            ],
          },
        },
      };

      const foreignKeys = databaseToForeignKeys(database);

      expect(foreignKeys).toEqual({
        1: { id: 1, name: "Public.foo → bar", description: "foobar" },
        2: { id: 2, name: "bar → foo", description: "barfoo" },
      });
    });
  });

  describe("tablesToSchemaSeparatedTables()", () => {
    it("should add schema separator to appropriate locations and sort tables by name", () => {
      const tables = {
        1: { id: 1, name: "Toucan", schema_name: "foo" },
        2: { id: 2, name: "Elephant", schema_name: "bar" },
        3: { id: 3, name: "Giraffe", schema_name: "boo" },
        4: { id: 4, name: "Wombat", schema_name: "bar" },
        5: { id: 5, name: "Anaconda", schema_name: "foo" },
        6: { id: 6, name: "Buffalo", schema_name: "bar" },
      };

      const createSchemaSeparator = table => table.schema_name;
      const createListItem = table => table;

      const schemaSeparatedTables = separateTablesBySchema(
        tables,
        createSchemaSeparator,
        createListItem,
      );

      expect(schemaSeparatedTables).toEqual([
        ["bar", { id: 6, name: "Buffalo", schema_name: "bar" }],
        { id: 2, name: "Elephant", schema_name: "bar" },
        { id: 4, name: "Wombat", schema_name: "bar" },
        ["boo", { id: 3, name: "Giraffe", schema_name: "boo" }],
        ["foo", { id: 5, name: "Anaconda", schema_name: "foo" }],
        { id: 1, name: "Toucan", schema_name: "foo" },
      ]);
    });
  });

  describe("getQuestion()", () => {
    const tableId = 5;
    const dbId = 7;
    const metric = createMockMetric({ table_id: tableId });
    const metricId = metric.id;
    const segment = createMockSegment({ table_id: tableId });
    const segmentId = segment.id;
    const field = createMockField({ table_id: tableId });
    const fieldId = field.id;
    const table = createMockTable({
      id: tableId,
      fields: [field],
      metrics: [metric],
      segments: [segment],
    });
    const database = createMockDatabase({ id: dbId, tables: [table] });
    const metadata = createMockMetadata({ databases: [database] });

    const getNewQuestion = ({
      display = "table",
      aggregation,
      breakout,
      filter,
    } = {}) => {
      const card = {
        name: undefined,
        collection_id: undefined,
        display,
        visualization_settings: {},
        dataset_query: {
          database: database.id,
          type: "query",
          query: {
            "source-table": tableId,
          },
        },
      };
      if (aggregation != null) {
        card.dataset_query.query.aggregation = aggregation;
      }
      if (breakout != null) {
        card.dataset_query.query.breakout = breakout;
      }
      if (filter != null) {
        card.dataset_query.query.filter = filter;
      }
      return card;
    };

    it("should generate correct question for table raw data", () => {
      const question = getQuestion({
        dbId,
        tableId,
        metadata,
      });

      expect(question).toEqual(getNewQuestion());
    });

    it("should generate correct question for table counts", () => {
      const question = getQuestion({
        dbId,
        tableId,
        getCount: true,
        metadata,
      });

      expect(question).toEqual(
        getNewQuestion({
          aggregation: [["count"]],
        }),
      );
    });

    it("should generate correct question for field raw data", () => {
      const question = getQuestion({
        dbId,
        tableId,
        fieldId,
        metadata,
      });

      expect(question).toEqual(
        getNewQuestion({
          breakout: [["field", fieldId, { "base-type": "type/Text" }]],
        }),
      );
    });

    it("should generate correct question for field group by bar chart", () => {
      const question = getQuestion({
        dbId,
        tableId,
        fieldId,
        getCount: true,
        visualization: "bar",
        metadata,
      });

      expect(question).toEqual(
        getNewQuestion({
          display: "bar",
          breakout: [["field", fieldId, { "base-type": "type/Text" }]],
          aggregation: [["count"]],
        }),
      );
    });

    it("should generate correct question for field group by pie chart", () => {
      const question = getQuestion({
        dbId,
        tableId,
        fieldId,
        getCount: true,
        visualization: "pie",
        metadata,
      });

      expect(question).toEqual(
        getNewQuestion({
          display: "pie",
          breakout: [["field", fieldId, { "base-type": "type/Text" }]],
          aggregation: [["count"]],
        }),
      );
    });

    it("should generate correct question for metric raw data", () => {
      const question = getQuestion({
        dbId,
        tableId,
        metricId,
        metadata,
      });

      expect(question).toEqual(
        getNewQuestion({
          aggregation: [["metric", metricId]],
        }),
      );
    });

    it("should generate correct question for metric group by fields", () => {
      const question = getQuestion({
        dbId,
        tableId,
        fieldId,
        metricId,
        metadata,
      });

      expect(question).toEqual(
        getNewQuestion({
          aggregation: [["metric", metricId]],
          breakout: [["field", fieldId, { "base-type": "type/Text" }]],
        }),
      );
    });

    it("should generate correct question for segment raw data", () => {
      const question = getQuestion({
        dbId,
        tableId,
        segmentId,
        metadata,
      });

      expect(question).toEqual(
        getNewQuestion({
          filter: ["segment", segmentId],
        }),
      );
    });

    it("should generate correct question for segment counts", () => {
      const question = getQuestion({
        dbId,
        tableId,
        segmentId,
        getCount: true,
        metadata,
      });

      expect(question).toEqual(
        getNewQuestion({
          aggregation: [["count"]],
          filter: ["segment", segmentId],
        }),
      );
    });
  });
});
