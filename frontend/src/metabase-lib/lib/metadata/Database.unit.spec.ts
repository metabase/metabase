import { createMockDatabase } from "metabase-types/api/mocks/database";

import Database from "./Database";
import Schema from "./Schema";
import Metadata from "./Metadata";
import Table from "./Table";
import Question from "../Question";

const database = createMockDatabase();

describe("Database", () => {
  describe("instantiation", () => {
    it("should create an instance of Schema", () => {
      expect(new Database(database)).toBeInstanceOf(Database);
    });

    it("should add all IDatabase properties to the instance", () => {
      const databaseInstance = new Database(database);

      for (const [key, value] of Object.entries(database)) {
        expect(databaseInstance[key as keyof Database]).toEqual(value);
      }
    });

    it("should add properties found on the constructor object that aren't in IDatabase", () => {
      const databaseInstance = new Database({
        ...database,
        // @ts-expect-error: we're testing that properties that aren't in IDatabase are added to the instance
        abc: 123,
        tables: [1, 2, 3],
      });

      // @ts-expect-error: we're testing that properties that aren't in IDatabase are added to the instance
      expect(databaseInstance.abc).toEqual(123);
      expect(databaseInstance.tables).toEqual([1, 2, 3]);
    });
  });

  describe("displayName", () => {
    it("should return the name prop", () => {
      expect(new Database(database).displayName()).toBe("foo");
    });
  });

  describe("schema", () => {
    let schemaInstance: Schema;
    let databaseInstance: Database;
    beforeEach(() => {
      const metadata = new Metadata();

      databaseInstance = new Database(database);
      databaseInstance.metadata = metadata;

      schemaInstance = new Schema({
        id: "1:foo",
        name: "foo",
        database: databaseInstance,
      });
      schemaInstance.metadata = metadata;

      metadata.schemas = {
        [schemaInstance.id]: schemaInstance,
      };
    });

    it("should return the schema with the given name", () => {
      expect(databaseInstance.schema("foo")).toBe(schemaInstance);
    });

    it("should return null when the given schema name doesn not match a schema", () => {
      expect(databaseInstance.schema("bar")).toBe(null);
    });
  });

  describe("schemaNames", () => {
    it("should return a list of schemaNames", () => {
      const databaseInstance = new Database(database);
      databaseInstance.schemas = [
        new Schema({
          id: "1:foo",
          name: "foo",
          database: databaseInstance,
        }),
        new Schema({
          id: "1:bar",
          name: "bar",
          database: databaseInstance,
        }),
      ];

      expect(databaseInstance.schemaNames()).toEqual(["bar", "foo"]);
    });
  });

  describe("tablesLookup", () => {
    it("should return a map of tables keyed by id", () => {
      const table1 = new Table({
        id: 1,
      });
      const table2 = new Table({
        id: 2,
      });

      const databaseInstance1 = new Database(database);
      expect(databaseInstance1.tablesLookup()).toEqual({});

      const databaseInstance2 = new Database(database);
      databaseInstance2.tables = [table1, table2];
      expect(databaseInstance2.tablesLookup()).toEqual({
        [table1.id]: table1,
        [table2.id]: table2,
      });
    });
  });

  describe("hasFeature", () => {
    it("returns true when given a falsy `feature`", () => {
      expect(new Database(database).hasFeature(null)).toBe(true);
      expect(new Database(database).hasFeature("")).toBe(true);
    });

    it("should return true when given `feature` is found within the `features` on the instance", () => {
      expect(
        new Database({
          ...database,
          features: ["foo"],
        }).hasFeature("foo"),
      ).toBe(true);
    });

    it("should return false when given `feature` is not found within the `features` on the instance", () => {
      expect(
        new Database({
          ...database,
          features: ["foo"],
        }).hasFeature("bar"),
      ).toBe(false);
    });

    it("should return false for 'join' even when it exists in `features`", () => {
      expect(
        new Database({
          ...database,
          features: ["join"],
        }).hasFeature("join"),
      ).toBe(false);
    });

    it("should return true for 'join' for a set of other values", () => {
      ["left-join", "right-join", "inner-join", "full-join"].forEach(
        feature => {
          expect(
            new Database({
              ...database,
              features: [feature],
            }).hasFeature("join"),
          ).toBe(true);
        },
      );
    });
  });

  describe("supportsPivots", () => {
    it("returns true when `expressions` and `left-join` exist in `features`", () => {
      expect(
        new Database({
          ...database,
          features: ["foo", "left-join"],
        }).supportsPivots(),
      ).toBe(false);

      expect(
        new Database({
          ...database,
          features: ["expressions", "right-join"],
        }).supportsPivots(),
      ).toBe(false);

      expect(
        new Database({
          ...database,
          features: ["expressions", "left-join"],
        }).supportsPivots(),
      ).toBe(true);
    });
  });

  describe("question", () => {
    const metadata = new Metadata();
    const databaseInstance = new Database(database);

    metadata.databases = {
      [databaseInstance.id]: databaseInstance,
    };
    databaseInstance.metadata = metadata;

    it("should create a question using the `metadata` found on the Database instance", () => {
      const question = databaseInstance.question();
      expect(question.metadata()).toBe(metadata);
    });

    it("should create a question using the given Database instance's id in the question's query", () => {
      expect(databaseInstance.question().datasetQuery()).toEqual({
        database: 1,
        query: {},
        type: "query",
      });

      expect(
        databaseInstance
          .question({
            "source-table": 2,
          })
          .datasetQuery(),
      ).toEqual({
        database: 1,
        query: {
          "source-table": 2,
        },
        type: "query",
      });
    });
  });

  describe("nativeQuestion", () => {
    const metadata = new Metadata();
    const databaseInstance = new Database(database);

    metadata.databases = {
      [databaseInstance.id]: databaseInstance,
    };
    databaseInstance.metadata = metadata;

    it("should create a native question using the `metadata` found on the Database instance", () => {
      const question = databaseInstance.nativeQuestion();
      expect(question.metadata()).toBe(metadata);
    });

    it("should create a native question using the given Database instance's id in the question's query", () => {
      expect(databaseInstance.nativeQuestion().datasetQuery()).toEqual({
        database: 1,
        native: {
          query: "",
          "template-tags": {},
        },
        type: "native",
      });

      expect(
        databaseInstance
          .nativeQuestion({
            query: "foo",
          })
          .datasetQuery(),
      ).toEqual({
        database: 1,
        native: {
          query: "foo",
          "template-tags": {},
        },
        type: "native",
      });
    });
  });

  describe("newQuestion", () => {
    const metadata = new Metadata();
    const databaseInstance = new Database(database);

    metadata.databases = {
      [databaseInstance.id]: databaseInstance,
    };
    databaseInstance.metadata = metadata;

    it("should return new question with defaulted query and display", () => {
      Question.prototype.setDefaultQuery = jest.fn(function(this: Question) {
        return this;
      });
      Question.prototype.setDefaultDisplay = jest.fn(function(this: Question) {
        return this;
      });

      const question = databaseInstance.newQuestion();
      expect(question).toBeInstanceOf(Question);
      expect(Question.prototype.setDefaultDisplay).toHaveBeenCalled();
      expect(Question.prototype.setDefaultQuery).toHaveBeenCalled();
    });
  });

  describe("savedQuestionsDatabase", () => {
    const metadata = new Metadata();
    const databaseInstance1 = new Database(database);
    const databaseInstance2 = new Database({
      ...database,
      is_saved_questions: true,
    });

    metadata.databases = {
      [databaseInstance1.id]: databaseInstance1,
      [databaseInstance2.id]: databaseInstance2,
    };
    databaseInstance1.metadata = metadata;
    databaseInstance2.metadata = metadata;

    it("should return the 'fake' saved questions database", () => {
      expect(databaseInstance1.savedQuestionsDatabase()).toBe(
        databaseInstance2,
      );
    });
  });

  describe("canWrite", () => {
    it("should be true for a db with write permissions", () => {
      const databaseInstance = new Database({
        ...database,
        native_permissions: "write",
      });

      expect(databaseInstance.canWrite()).toBe(true);
    });

    it("should be false for a db without write permissions", () => {
      const databaseInstance = new Database({
        ...database,
        native_permissions: "none",
      });

      expect(databaseInstance.canWrite()).toBe(false);
    });
  });
});
