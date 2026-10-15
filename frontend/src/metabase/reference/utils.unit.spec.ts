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
        1: { id: 1, name: "Toucan", schema: "foo" },
        2: { id: 2, name: "Elephant", schema: "bar" },
        3: { id: 3, name: "Giraffe", schema: "boo" },
        4: { id: 4, name: "Wombat", schema: "bar" },
        5: { id: 5, name: "Anaconda", schema: "foo" },
        6: { id: 6, name: "Buffalo", schema: "bar" },
      };

      const createSchemaSeparator = (table: { schema: string }) => table.schema;
      const createListItem = (table: { schema: string }) => table;

      const schemaSeparatedTables = separateTablesBySchema(
        tables,
        createSchemaSeparator,
        createListItem,
      );

      expect(schemaSeparatedTables).toEqual([
        ["bar", { id: 6, name: "Buffalo", schema: "bar" }],
        { id: 2, name: "Elephant", schema: "bar" },
        { id: 4, name: "Wombat", schema: "bar" },
        ["boo", { id: 3, name: "Giraffe", schema: "boo" }],
        ["foo", { id: 5, name: "Anaconda", schema: "foo" }],
        { id: 1, name: "Toucan", schema: "foo" },
      ]);
    });
  });

  describe("getQuestion()", () => {
    const tableId = 5;
    const dbId = 7;
    const segment = createMockSegment({ table_id: tableId });
    const segmentId = segment.id;
    const field = createMockField({ table_id: tableId });
    // Unjustified type cast. FIXME
    const table = createMockTable({
      id: tableId,
      db_id: dbId,
      fields: [field],
      segments: [segment],
    });
    const database = createMockDatabase({ id: dbId, tables: [table] });
    const metadata = createMockMetadata({ databases: [database] });
    const metadataProvider = Lib.metadataProvider(dbId, metadata);

    it("should generate correct question for table raw data", () => {
      const card = getQuestion({
        metadataProvider,
        tableId,
      });

      const query = new Question(card).query();
      expect(Lib.sourceTableOrCardId(query)).toBe(tableId);
    });

    it("should generate correct question for table counts", () => {
      const card = getQuestion({
        metadataProvider,
        tableId,
        getCount: true,
      });

      const query = new Question(card).query();
      expect(Lib.aggregations(query, stageIndex)).toHaveLength(1);
    });

    it("should generate correct question for field raw data", () => {
      const card = getQuestion({
        metadataProvider,
        tableId,
        breakoutField: field,
      });

      const query = new Question(card).query();
      expect(Lib.breakouts(query, stageIndex)).toHaveLength(1);
    });

    it("should generate correct question for field group by bar chart", () => {
      const card = getQuestion({
        metadataProvider,
        tableId,
        breakoutField: field,
        getCount: true,
        visualization: "bar",
      });

      const query = new Question(card).query();
      expect(card?.display).toBe("bar");
      expect(Lib.aggregations(query, stageIndex)).toHaveLength(1);
      expect(Lib.breakouts(query, stageIndex)).toHaveLength(1);
    });

    it("should generate correct question for field group by pie chart", () => {
      const card = getQuestion({
        metadataProvider,
        tableId,
        breakoutField: field,
        getCount: true,
        visualization: "pie",
      });

      const query = new Question(card).query();
      expect(card?.display).toBe("pie");
      expect(Lib.aggregations(query, stageIndex)).toHaveLength(1);
      expect(Lib.breakouts(query, stageIndex)).toHaveLength(1);
    });

    it("should generate correct question for segment raw data", () => {
      const card = getQuestion({
        metadataProvider,
        tableId,
        segmentId,
      });

      const query = new Question(card).query();
      expect(Lib.filters(query, stageIndex)).toHaveLength(1);
    });

    it("should generate correct question for segment counts", () => {
      const card = getQuestion({
        metadataProvider,
        tableId,
        segmentId,
        getCount: true,
      });

      const query = new Question(card).query();
      expect(Lib.filters(query, stageIndex)).toHaveLength(1);
      expect(Lib.aggregations(query, stageIndex)).toHaveLength(1);
    });
  });
});
