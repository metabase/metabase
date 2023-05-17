// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import Question from "../Question";
import Database from "./Database";
import Schema from "./Schema";
import Metadata from "./Metadata";
import Table from "./Table";

describe("Database", () => {
  describe("instantiation", () => {
    it("should create an instance of Schema", () => {
      expect(new Database()).toBeInstanceOf(Database);
    });
  });
  describe("displayName", () => {
    it("should return the name prop", () => {
      expect(
        new Database({
          name: "foo",
        }).displayName(),
      ).toBe("foo");
    });
  });
  describe("schema", () => {
    let schema;
    let database;
    beforeEach(() => {
      schema = new Schema({
        id: "123:foo",
      });
      const metadata = new Metadata({
        schemas: {
          "123:foo": schema,
        },
      });
      database = new Database({
        id: 123,
        metadata,
      });
    });
    it("should return the schema with the given name", () => {
      expect(database.schema("foo")).toBe(schema);
    });
    it("should return null when the given schema name doesn not match a schema", () => {
      expect(database.schema("bar")).toBe(null);
    });
  });
  describe("schemaNames", () => {
    it("should return a list of schemaNames", () => {
      const database = new Database({
        id: 123,
        schemas: [
          new Schema({
            id: "123:foo",
            name: "foo",
          }),
          new Schema({
            id: "123:bar",
            name: "bar",
          }),
        ],
      });
      expect(database.schemaNames()).toEqual(["bar", "foo"]);
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
      expect(
        new Database({
          tables: [],
        }).tablesLookup(),
      ).toEqual({});
      expect(
        new Database({
          tables: [table1, table2],
        }).tablesLookup(),
      ).toEqual({
        1: table1,
        2: table2,
      });
    });
  });
  describe("hasFeature", () => {
    it("returns true when given a falsy `feature`", () => {
      expect(new Database({}).hasFeature(null)).toBe(true);
      expect(new Database({}).hasFeature("")).toBe(true);
    });
    it("should return true when given `feature` is found within the `features` on the instance", () => {
      expect(
        new Database({
          features: ["foo"],
        }).hasFeature("foo"),
      ).toBe(true);
    });
    it("should return false when given `feature` is not found within the `features` on the instance", () => {
      expect(
        new Database({
          features: ["foo"],
        }).hasFeature("bar"),
      ).toBe(false);
    });
    it("should return false for 'join' even when it exists in `features`", () => {
      expect(
        new Database({
          features: ["join"],
        }).hasFeature("join"),
      ).toBe(false);
    });
    it("should return true for 'join' for a set of other values", () => {
      ["left-join", "right-join", "inner-join", "full-join"].forEach(
        feature => {
          expect(
            new Database({
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
          features: ["foo", "left-join"],
        }).supportsPivots(),
      ).toBe(false);
      expect(
        new Database({
          features: ["expressions", "right-join"],
        }).supportsPivots(),
      ).toBe(false);
      expect(
        new Database({
          features: ["expressions", "left-join"],
        }).supportsPivots(),
      ).toBe(true);
    });
  });
  describe("question", () => {
    it("should create a question using the `metadata` found on the Database instance", () => {
      const metadata = new Metadata();
      const database = new Database({
        metadata,
      });
      const question = database.question();
      expect(question.metadata()).toBe(metadata);
    });
    it("should create a question using the given Database instance's id in the question's query", () => {
      const database = new Database({
        id: 123,
      });
      expect(database.question().datasetQuery()).toEqual({
        database: 123,
        query: {
          "source-table": undefined,
        },
        type: "query",
      });
      expect(
        database
          .question({
            foo: "bar",
          })
          .datasetQuery(),
      ).toEqual({
        database: 123,
        query: {
          foo: "bar",
        },
        type: "query",
      });
    });
  });
  describe("nativeQuestion", () => {
    it("should create a native question using the `metadata` found on the Database instance", () => {
      const metadata = new Metadata();
      const database = new Database({
        metadata,
      });
      const question = database.nativeQuestion();
      expect(question.metadata()).toBe(metadata);
    });
    it("should create a native question using the given Database instance's id in the question's query", () => {
      const database = new Database({
        id: 123,
      });
      expect(database.nativeQuestion().datasetQuery()).toEqual({
        database: 123,
        native: {
          query: "",
          "template-tags": {},
        },
        type: "native",
      });
      expect(
        database
          .nativeQuestion({
            foo: "bar",
          })
          .datasetQuery(),
      ).toEqual({
        database: 123,
        native: {
          query: "",
          "template-tags": {},
          foo: "bar",
        },
        type: "native",
      });
    });
  });
  describe("newQuestion", () => {
    it("should return new question with defaulted query and display", () => {
      const database = new Database({
        id: 123,
      });
      Question.prototype.setDefaultQuery = jest.fn(function () {
        return this;
      });
      Question.prototype.setDefaultDisplay = jest.fn(function () {
        return this;
      });
      const question = database.newQuestion();
      expect(question).toBeInstanceOf(Question);
      expect(Question.prototype.setDefaultDisplay).toHaveBeenCalled();
      expect(Question.prototype.setDefaultQuery).toHaveBeenCalled();
    });
  });
  describe("savedQuestionsDatabase", () => {
    it("should return the 'fake' saved questions database", () => {
      const database1 = new Database({
        id: 1,
      });
      const database2 = new Database({
        id: 2,
        is_saved_questions: true,
      });
      const metadata = new Metadata({
        databases: {
          1: database1,
          2: database2,
        },
      });
      database1.metadata = metadata;
      expect(database1.savedQuestionsDatabase()).toBe(database2);
    });
  });

  describe("canWrite", () => {
    it("should be true for a db with write permissions", () => {
      const database = new Database({
        id: 1,
        native_permissions: "write",
      });

      expect(database.canWrite()).toBe(true);
    });

    it("should be false for a db without write permissions", () => {
      const database = new Database({
        id: 1,
        native_permissions: "none",
      });

      expect(database.canWrite()).toBe(false);
    });
  });
});
