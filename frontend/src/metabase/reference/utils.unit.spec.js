import { createMockMetadata } from "__support__/metadata";
import { separateTablesBySchema } from "metabase/reference/databases/TableList";
import { getQuestion } from "metabase/reference/utils";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import {
  createMockDatabase,
  createMockField,
  createMockSegment,
  createMockTable,
} from "metabase-types/api/mocks";

describe("Reference utils.js", () => {
  const stageIndex = 0;

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

      const createSchemaSeparator = (table) => table.schema_name;
      const createListItem = (table) => table;

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
    const segment = createMockSegment({ table_id: tableId });
    const segmentId = segment.id;
    const field = createMockField({ table_id: tableId });
    const fieldId = field.id;
    const table = createMockTable({
      id: tableId,
      db_id: dbId,
      fields: [field],
      segments: [segment],
    });
    const database = createMockDatabase({ id: dbId, tables: [table] });
    const metadata = createMockMetadata({ databases: [database] });

    it("should generate correct question for table raw data", () => {
      const card = getQuestion({
        dbId,
        tableId,
        metadata,
      });

      const query = new Question(card).query();
      expect(Lib.sourceTableOrCardId(query)).toBe(tableId);
    });

    it("should generate correct question for table counts", () => {
      const card = getQuestion({
        dbId,
        tableId,
        getCount: true,
        metadata,
      });

      const query = new Question(card).query();
      expect(Lib.aggregations(query, stageIndex)).toHaveLength(1);
    });

    it("should generate correct question for field raw data", () => {
      const card = getQuestion({
        dbId,
        tableId,
        fieldId,
        metadata,
      });

      const query = new Question(card).query();
      expect(Lib.breakouts(query, stageIndex)).toHaveLength(1);
    });

    it("should generate correct question for field group by bar chart", () => {
      const card = getQuestion({
        dbId,
        tableId,
        fieldId,
        getCount: true,
        visualization: "bar",
        metadata,
      });

      const query = new Question(card).query();
      expect(card.display).toBe("bar");
      expect(Lib.aggregations(query, stageIndex)).toHaveLength(1);
      expect(Lib.breakouts(query, stageIndex)).toHaveLength(1);
    });

    it("should generate correct question for field group by pie chart", () => {
      const card = getQuestion({
        dbId,
        tableId,
        fieldId,
        getCount: true,
        visualization: "pie",
        metadata,
      });

      const query = new Question(card).query();
      expect(card.display).toBe("pie");
      expect(Lib.aggregations(query, stageIndex)).toHaveLength(1);
      expect(Lib.breakouts(query, stageIndex)).toHaveLength(1);
    });

    it("should generate correct question for segment raw data", () => {
      const card = getQuestion({
        dbId,
        tableId,
        segmentId,
        metadata,
      });

      const query = new Question(card).query();
      expect(Lib.filters(query, stageIndex)).toHaveLength(1);
    });

    it("should generate correct question for segment counts", () => {
      const card = getQuestion({
        dbId,
        tableId,
        segmentId,
        getCount: true,
        metadata,
      });

      const query = new Question(card).query();
      expect(Lib.filters(query, stageIndex)).toHaveLength(1);
      expect(Lib.aggregations(query, stageIndex)).toHaveLength(1);
    });
  });
});
