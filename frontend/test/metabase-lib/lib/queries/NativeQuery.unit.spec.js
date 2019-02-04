// HACK: needed due to cyclical dependency issue
import "metabase-lib/lib/Question";

import {
  question,
  DATABASE_ID,
  MONGO_DATABASE_ID,
} from "__support__/sample_dataset_fixture";

import NativeQuery from "metabase-lib/lib/queries/NativeQuery";

function makeDatasetQuery(queryText, templateTags, databaseId) {
  return {
    type: "native",
    database: databaseId,
    native: {
      query: queryText,
      "template-tags": templateTags,
    },
  };
}

function makeQuery(query, templateTags) {
  return new NativeQuery(
    question,
    makeDatasetQuery(query, templateTags, DATABASE_ID),
  );
}

function makeMongoQuery(query, templateTags) {
  return new NativeQuery(
    question,
    makeDatasetQuery(query, templateTags, MONGO_DATABASE_ID),
  );
}

const query: NativeQuery = makeQuery("");

describe("NativeQuery", () => {
  describe("You can access the metadata for the database a query has been written against", () => {
    describe("tables()", () => {
      it("Tables should return multiple tables", () => {
        expect(Array.isArray(query.tables())).toBe(true);
      });
      it("Tables should return a table map that includes fields", () => {
        expect(Array.isArray(query.tables()[0].fields)).toBe(true);
      });
    });
    describe("databaseId()", () => {
      it("returns the Database ID of the wrapped query ", () => {
        expect(query.databaseId()).toBe(DATABASE_ID);
      });
    });
    describe("database()", () => {
      it("returns a dictionary with the underlying database of the wrapped query", () => {
        expect(query.database().id).toBe(DATABASE_ID);
      });
    });

    describe("engine() tells you what the engine of the database you are querying is", () => {
      it("identifies the correct engine in H2 queries", () => {
        // This is a magic constant and we should probably pull this up into an enum
        expect(query.engine()).toBe("h2");
      });
      it("identifies the correct engine for Mongo queries", () => {
        expect(makeMongoQuery("").engine()).toBe("mongo");
      });
    });
    describe("supportsNativeParameters()", () => {
      it("Verify that H2 queries support Parameters", () => {
        expect(query.supportsNativeParameters()).toBe(true);
      });
      it("Verify that MongoDB queries do not support Parameters", () => {
        expect(makeMongoQuery("").supportsNativeParameters()).toBe(false);
      });
    });
    describe("aceMode()", () => {
      it("Mongo gets JSON mode ", () => {
        expect(makeMongoQuery("").aceMode()).toBe("ace/mode/json");
      });
      it("H2 gets generic SQL mode in the editor", () => {
        expect(query.aceMode()).toBe("ace/mode/sql");
      });
    });
  });

  describe("Queries have some helpful status checks", () => {
    describe("isEmpty()", () => {
      it("Verify that an empty query isEmpty()", () => {
        expect(query.isEmpty()).toBe(true);
      });
      it("Verify that a simple query is not isEmpty()", () => {
        expect(query.updateQueryText("SELECT * FROM ORDERS").isEmpty()).toBe(
          false,
        );
      });
    });
  });

  describe("Mongo native queries need to pick a collection the native query is hitting", () => {
    // should we somehow simulate a mongo query here?
    // NOTE: Would be nice to have QB UI tests for mongo-specific interactions as well
    describe("requiresTable()", () => {
      it("Native H2 Queries should not require table selection", () => {
        expect(query.requiresTable()).toBe(false);
      });
      it("Native Mongo Queries should require table selection", () => {
        expect(makeMongoQuery("").requiresTable()).toBe(true);
      });
    });

    describe("updateCollection(newCollection) selects or updates a target table for you mongo native query", () => {
      it("allows you to update mongo collections", () => {
        const fakeCollectionID = 9999;
        const fakeMongoQuery = makeMongoQuery("").updateCollection(
          fakeCollectionID,
        );
        expect(fakeMongoQuery.collection()).toBe(fakeCollectionID);
      });
      it("sure would be nice to have some error checking on this", () => {
        pending();
      });
    });
    describe("table()", () => {
      it("returns null for a non-mongo query", () => {
        expect(query.table()).toBe(null);
        expect(query.updateQueryText("SELECT * FROM ORDERS").table()).toBe(
          null,
        );
      });
    });
  });
  describe("Acessing the underlying native query", () => {
    describe("You can access the actual native query via queryText()", () => {
      expect(makeQuery("SELECT * FROM ORDERS").queryText()).toEqual(
        "SELECT * FROM ORDERS",
      );
    });
    describe("You can update query text the same way as well via updateQueryText(newQueryText)", () => {
      const newQuery = makeQuery("SELECT 1");
      expect(newQuery.queryText()).toEqual("SELECT 1");
      const newerQuery = newQuery.updateQueryText("SELECT 2");
      expect(newerQuery.queryText()).toEqual("SELECT 2");
    });
    describe("lineCount() lets you know how long your query is", () => {
      expect(makeQuery("SELECT 1").lineCount()).toBe(1);
      expect(makeQuery("SELECT \n 1").lineCount()).toBe(2);
    });
  });
  describe("Native Queries support Templates and Parameters", () => {
    describe("You can get the number of parameters via templateTags()", () => {
      it("Non templated queries don't have parameters", () => {
        const newQuery = makeQuery().updateQueryText("SELECT 1");
        expect(newQuery.templateTags().length).toBe(0);
      });

      it("Templated queries do have parameters", () => {
        const newQuery = makeQuery().updateQueryText(
          "SELECT * from ORDERS where total < {{max_price}}",
        );
        expect(newQuery.templateTags().length).toBe(1);
      });
    });
    describe("You can get a pre-structured map keyed by name via templateTagsMap()", () => {
      it("Non templated queries don't have parameters", () => {
        const newQuery = makeQuery().updateQueryText("SELECT 1");
        expect(newQuery.templateTagsMap()).toEqual({});
      });

      it("Templated queries do have parameters", () => {
        const newQuery = makeQuery().updateQueryText(
          "SELECT * from ORDERS where total < {{max_price}}",
        );
        const tagMaps = newQuery.templateTagsMap();
        expect(tagMaps["max_price"].name).toEqual("max_price");
        expect(tagMaps["max_price"].display_name).toEqual("Max price");
      });
    });
  });
});
