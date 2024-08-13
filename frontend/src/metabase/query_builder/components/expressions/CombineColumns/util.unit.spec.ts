import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import { createQuery, columnFinder } from "metabase-lib/test-helpers";
import {
  createMockDatabase,
  createMockField,
  createMockTable,
} from "metabase-types/api/mocks";

import {
  label,
  formatSeparator,
  getDefaultSeparator,
  getExpressionName,
  getExample,
} from "./util";

const EMAIL = createMockField({
  id: 1,
  name: "EMAIL",
  display_name: "Email",
  semantic_type: "type/Email",
  base_type: "type/String",
});
const URL = createMockField({
  id: 2,
  name: "URL",
  display_name: "Url",
  semantic_type: "type/URL",
  base_type: "type/String",
});

const STRING = createMockField({
  id: 3,
  name: "STRING",
  display_name: "String",
  base_type: "type/String",
});

const INT = createMockField({
  id: 4,
  name: "INT",
  display_name: "Int",
  base_type: "type/Integer",
});

const TABLE = createMockTable({
  fields: [EMAIL, URL, STRING, INT],
});

const DATABASE = createMockDatabase({
  tables: [TABLE],
});

const QUERY = createQuery({
  databaseId: DATABASE.id,
  metadata: createMockMetadata({ databases: [DATABASE] }),
  query: {
    database: DATABASE.id,
    type: "query",
    query: {
      "source-table": TABLE.id,
    },
  },
});

function getColumn(name: string) {
  const columns = Lib.expressionableColumns(QUERY, -1);
  const find = columnFinder(QUERY, columns);
  return find(TABLE.name, name);
}

describe("CombineColumns", () => {
  describe("label", () => {
    it("should render the correct column label for a given index", () => {
      expect(label(0)).toBe("First column");
      expect(label(1)).toBe("Second column");
      expect(label(2)).toBe("Third column");
      expect(label(10)).toBe("Column 11");
    });
  });

  describe("formatSeparator", () => {
    it("should format the separator correctly", () => {
      expect(formatSeparator("")).toBe("(empty)");
      expect(formatSeparator(" ")).toBe("(space)");
      expect(formatSeparator("---")).toBe("---");
    });
  });

  describe("getDefaultSeparator", () => {
    it("should return '' for an email column", () => {
      const column = getColumn("EMAIL");
      expect(getDefaultSeparator(column)).toBe("");
    });
    it("should return '/' for any other column type", () => {
      const column = getColumn("URL");
      expect(getDefaultSeparator(column)).toBe("/");
    });
    it("should return ' ' for any other column type", () => {
      const string = getColumn("STRING");
      expect(getDefaultSeparator(string)).toBe(" ");

      const int = getColumn("INT");
      expect(getDefaultSeparator(int)).toBe(" ");
    });
  });

  describe("getExpressionName", () => {
    it("should return a sensible name", () => {
      const columnsAndSeparators = [
        { separator: "", column: getColumn("EMAIL") },
        { separator: "_", column: getColumn("STRING") },
        { separator: "_", column: getColumn("INT") },
        { separator: "_", column: null },
      ];

      const name = getExpressionName(QUERY, -1, columnsAndSeparators);
      expect(name).toBe("Combined Email, String, Int");
    });
  });

  describe("getExample", () => {
    it("should return a sensible example", () => {
      const columnsAndSeparators = [
        { separator: "", column: getColumn("EMAIL") },
        { separator: "#", column: getColumn("STRING") },
        { separator: "&", column: null },
        { separator: "%", column: getColumn("INT") },
      ];

      const name = getExample(columnsAndSeparators);
      expect(name).toBe("email@example.com#text&%123");
    });
  });
});
