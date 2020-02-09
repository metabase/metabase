import { assocIn } from "icepick";

import {
  SAMPLE_DATASET,
  PRODUCTS,
  MONGO_DATABASE,
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
    SAMPLE_DATASET.question(),
    makeDatasetQuery(query, templateTags, SAMPLE_DATASET.id),
  );
}

function makeMongoQuery(query, templateTags) {
  return new NativeQuery(
    SAMPLE_DATASET.question(),
    makeDatasetQuery(query, templateTags, MONGO_DATABASE.id),
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
        expect(query.databaseId()).toBe(SAMPLE_DATASET.id);
      });
    });
    describe("database()", () => {
      it("returns a dictionary with the underlying database of the wrapped query", () => {
        expect(query.database().id).toBe(SAMPLE_DATASET.id);
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
        expect(query.setQueryText("SELECT * FROM ORDERS").isEmpty()).toBe(
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

    describe("setCollectionName(newCollection) selects or updates a target table for you mongo native query", () => {
      it("allows you to update mongo collections", () => {
        const fakeCollectionID = 9999;
        const fakeMongoQuery = makeMongoQuery("").setCollectionName(
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
        expect(query.setQueryText("SELECT * FROM ORDERS").table()).toBe(null);
      });
    });
  });
  describe("clean", () => {
    it("should add template-tags: {} if there are none", () => {
      const cleanedQuery = native =>
        new NativeQuery(SAMPLE_DATASET.question(), {
          type: "native",
          database: SAMPLE_DATASET.id,
          native,
        })
          .clean()
          .datasetQuery();
      const q1 = cleanedQuery({ query: "select 1" });
      const q2 = cleanedQuery({ query: "select 1", "template-tags": {} });
      expect(q1).toEqual(q2);
    });
  });
  describe("Acessing the underlying native query", () => {
    describe("You can access the actual native query via queryText()", () => {
      expect(makeQuery("SELECT * FROM ORDERS").queryText()).toEqual(
        "SELECT * FROM ORDERS",
      );
    });
    describe("You can update query text the same way as well via setQueryText(newQueryText)", () => {
      const newQuery = makeQuery("SELECT 1");
      expect(newQuery.queryText()).toEqual("SELECT 1");
      const newerQuery = newQuery.setQueryText("SELECT 2");
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
        const newQuery = makeQuery().setQueryText("SELECT 1");
        expect(newQuery.templateTags().length).toBe(0);
      });

      it("Templated queries do have parameters", () => {
        const newQuery = makeQuery().setQueryText(
          "SELECT * from ORDERS where total < {{max_price}}",
        );
        expect(newQuery.templateTags().length).toBe(1);
      });
    });
    describe("You can get a pre-structured map keyed by name via templateTagsMap()", () => {
      it("Non templated queries don't have parameters", () => {
        const newQuery = makeQuery().setQueryText("SELECT 1");
        expect(newQuery.templateTagsMap()).toEqual({});
      });

      it("Templated queries do have parameters", () => {
        const newQuery = makeQuery().setQueryText(
          "SELECT * from ORDERS where total < {{max_price}}",
        );
        const tagMaps = newQuery.templateTagsMap();
        expect(tagMaps["max_price"].name).toEqual("max_price");
        expect(tagMaps["max_price"].display_name).toEqual("Max price");
      });
    });
    describe("Invalid template tags prevent the query from running", () => {
      let q = makeQuery().setQueryText("SELECT * from ORDERS where {{foo}}");
      expect(q.canRun()).toBe(true);

      // set template tag's type to dimension without setting field id
      q = q.setDatasetQuery(
        assocIn(
          q.datasetQuery(),
          ["native", "template-tags", "foo", "type"],
          "dimension",
        ),
      );
      expect(q.canRun()).toBe(false);

      // now set the field
      q = q.setDatasetQuery(
        assocIn(
          q.datasetQuery(),
          ["native", "template-tags", "foo", "dimension"],
          ["field-id", 123],
        ),
      );
      expect(q.canRun()).toBe(true);
    });
  });
  describe("variables", () => {
    it("should return empty array if there are no tags", () => {
      const q = makeQuery().setQueryText("SELECT * FROM PRODUCTS");
      const variables = q.variables();
      expect(variables).toHaveLength(0);
    });
    it("should return variable for non-dimension template tag", () => {
      const q = makeQuery().setQueryText(
        "SELECT * FROM PRODUCTS WHERE CATEGORY = {{category}}",
      );
      const variables = q.variables();
      expect(variables).toHaveLength(1);
      expect(variables.map(v => v.displayName())).toEqual(["category"]);
    });
    it("should not return variable for dimension template tag", () => {
      const q = makeQuery()
        .setQueryText("SELECT * FROM PRODUCTS WHERE {{category}}")
        .setTemplateTag("category", { name: "category", type: "dimension" });
      expect(q.variables()).toHaveLength(0);
    });
  });
  describe("dimensionOptions", () => {
    it("should return empty dimensionOptions if there are no tags", () => {
      const q = makeQuery().setQueryText("SELECT * FROM PRODUCTS");
      expect(q.dimensionOptions().count).toBe(0);
    });
    it("should return a dimension for a dimension template tag", () => {
      const q = makeQuery()
        .setQueryText("SELECT * FROM PRODUCTS WHERE {{category}}")
        .setTemplateTag("category", {
          name: "category",
          type: "dimension",
          dimension: ["field-id", PRODUCTS.CATEGORY.id],
        });
      const dimensions = q.dimensionOptions().dimensions;
      expect(dimensions).toHaveLength(1);
      expect(dimensions.map(d => d.displayName())).toEqual(["Category"]);
    });
  });
});
