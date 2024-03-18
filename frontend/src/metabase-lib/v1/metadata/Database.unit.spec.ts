import { createMockMetadata } from "__support__/metadata";
import NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import StructuredQuery from "metabase-lib/v1/queries/StructuredQuery";
import type { Database } from "metabase-types/api";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";

interface SetupOpts {
  database?: Database;
  otherDatabases?: Database[];
}

const setup = ({
  database = createMockDatabase(),
  otherDatabases = [],
}: SetupOpts = {}) => {
  const metadata = createMockMetadata({
    databases: [database, ...otherDatabases],
  });

  const instance = metadata.database(database.id);
  if (!instance) {
    throw new TypeError();
  }

  return instance;
};

describe("Database", () => {
  describe("instantiation", () => {
    it("should create an instance of Database", () => {
      const database = setup({
        database: createMockDatabase({}),
      });
      expect(database).toBeDefined();
    });
  });

  describe("displayName", () => {
    it("should return the name prop", () => {
      const database = setup({
        database: createMockDatabase({
          name: "foo",
        }),
      });

      expect(database.displayName()).toBe("foo");
    });
  });

  describe("schema", () => {
    it("should return the schema with the given name", () => {
      const database = setup({
        database: createMockDatabase({
          tables: [
            createMockTable({
              schema: "public",
            }),
          ],
        }),
      });

      expect(database.schema("public")).toBeDefined();
      expect(database.schema("bar")).toBe(null);
    });
  });

  describe("schemaNames", () => {
    it("should return a list of schemaNames", () => {
      const database = setup({
        database: createMockDatabase({
          tables: [
            createMockTable({
              id: 1,
              schema: "foo",
            }),
            createMockTable({
              id: 2,
              schema: "bar",
            }),
          ],
        }),
      });

      expect(database.schemaNames()).toEqual(["bar", "foo"]);
    });
  });

  describe("tablesLookup", () => {
    it("should return a map of tables keyed by id", () => {
      const database = setup({
        database: createMockDatabase({
          tables: [
            createMockTable({
              id: 1,
            }),
            createMockTable({
              id: 2,
            }),
          ],
        }),
      });

      const lookup = database.tablesLookup();
      expect(lookup[1]).toBeDefined();
      expect(lookup[2]).toBeDefined();
      expect(lookup[1]).toBe(database.metadata?.table(1));
      expect(lookup[2]).toBe(database.metadata?.table(2));
    });
  });

  describe("hasFeature", () => {
    it("returns true when given a falsy `feature`", () => {
      const database = setup({
        database: createMockDatabase(),
      });

      expect(database.hasFeature(null)).toBe(true);
      expect(database.hasFeature("")).toBe(true);
    });

    it("should return true when given `feature` is found within the `features` on the instance", () => {
      const database = setup({
        database: createMockDatabase({
          features: ["inner-join"],
        }),
      });

      expect(database.hasFeature("inner-join")).toBe(true);
    });

    it("should return false when given `feature` is not found within the `features` on the instance", () => {
      const database = setup({
        database: createMockDatabase({
          features: ["inner-join"],
        }),
      });

      expect(database.hasFeature("persist-models")).toBe(false);
    });

    it.each(["left-join", "right-join", "inner-join", "full-join"] as const)(
      "should return true for 'join' for %s",
      feature => {
        const database = setup({
          database: createMockDatabase({
            features: [feature],
          }),
        });

        expect(database.hasFeature("join")).toBe(true);
      },
    );
  });

  describe("supportsPivots", () => {
    it("returns true when `expressions` and `left-join` exist in `features`", () => {
      const database = setup({
        database: createMockDatabase({
          features: ["expressions", "left-join"],
        }),
      });

      expect(database.supportsPivots()).toBe(true);
    });

    it("returns false when `expressions` and `left-join` not exist in `features`", () => {
      const database = setup({
        database: createMockDatabase({
          features: ["schemas", "persist-models"],
        }),
      });

      expect(database.supportsPivots()).toBe(false);
    });
  });

  describe("question", () => {
    it("should create a question using the `metadata` found on the Database instance", () => {
      const database = setup();
      const question = database.question();

      expect(question.legacyQuery({ useStructuredQuery: true })).toBeInstanceOf(
        StructuredQuery,
      );
      expect(question.metadata()).toEqual(database.metadata);
    });

    it("should create a question using the given Database instance's id in the question's query", () => {
      const table = createMockTable();
      const database = setup({
        database: createMockDatabase({ tables: [table] }),
      });
      const question = database.question({
        "source-table": table.id,
      });

      expect(question.databaseId()).toBe(database.id);
      expect(question.legacyQueryTableId()).toBe(table.id);
    });
  });

  describe("nativeQuestion", () => {
    it("should create a native question using the `metadata` found on the Database instance", () => {
      const database = setup();
      const question = database.nativeQuestion();

      expect(question.legacyQuery()).toBeInstanceOf(NativeQuery);
      expect(question.metadata()).toBe(database.metadata);
    });

    it("should create a native question using the given Database instance's id in the question's query", () => {
      const database = setup();
      const question = database.nativeQuestion({ query: "SELECT 1" });

      const query = question.legacyQuery() as NativeQuery;
      expect(query.queryText()).toBe("SELECT 1");
    });
  });

  describe("newQuestion", () => {
    it("should return new question with defaulted query and display", () => {
      const database = setup();
      const question = database.newQuestion();

      expect(question.display()).toBe("table");
    });
  });

  describe("savedQuestionsDatabase", () => {
    it("should return the 'fake' saved questions database", () => {
      const database = setup({
        database: createMockDatabase({ id: 1 }),
        otherDatabases: [
          createMockDatabase({ id: 2, is_saved_questions: true }),
        ],
      });

      const savedQuestionsDatabase = database.savedQuestionsDatabase();
      expect(savedQuestionsDatabase).toBeDefined();
      expect(savedQuestionsDatabase).toBe(database.metadata?.database(2));
    });
  });

  describe("canWrite", () => {
    it("should be true for a db with write permissions", () => {
      const database = setup({
        database: createMockDatabase({
          native_permissions: "write",
        }),
      });

      expect(database.canWrite()).toBe(true);
    });

    it("should be false for a db without write permissions", () => {
      const database = setup({
        database: createMockDatabase({
          native_permissions: "none",
        }),
      });

      expect(database.canWrite()).toBe(false);
    });
  });
});
