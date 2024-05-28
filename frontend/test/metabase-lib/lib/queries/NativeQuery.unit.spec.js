import { assocIn } from "icepick";

import { createMockMetadata } from "__support__/metadata";
import NativeQuery, {
  updateCardTemplateTagNames,
} from "metabase-lib/v1/queries/NativeQuery";
import { createMockDatabase } from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  PRODUCTS,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";

const MONGO_DB_ID = SAMPLE_DB_ID + 1;

const metadata = createMockMetadata({
  databases: [
    createSampleDatabase(),
    createMockDatabase({
      id: MONGO_DB_ID,
      engine: "mongo",
      features: ["basic-aggregations", "nested-fields", "dynamic-schema"],
    }),
  ],
});

const sampleDatabase = metadata.database(SAMPLE_DB_ID);

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
    sampleDatabase.question(),
    makeDatasetQuery(query, templateTags, SAMPLE_DB_ID),
  );
}

function makeMongoQuery(query, templateTags) {
  return new NativeQuery(
    sampleDatabase.question(),
    makeDatasetQuery(query, templateTags, MONGO_DB_ID),
  );
}

const query = makeQuery("");

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
    describe("_databaseId()", () => {
      it("returns the Database ID of the wrapped query", () => {
        expect(query._databaseId()).toBe(SAMPLE_DB_ID);
      });
    });
    describe("_database()", () => {
      it("returns a dictionary with the underlying database of the wrapped query", () => {
        expect(query._database().id).toBe(SAMPLE_DB_ID);
      });
    });

    describe("engine() tells you what the engine of the database you are querying is", () => {
      it("identifies the correct engine in H2 queries", () => {
        // This is a magic constant and we should probably pull this up into an enum
        expect(query.engine()).toBe("H2");
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
        const fakeMongoQuery =
          makeMongoQuery("").setCollectionName(fakeCollectionID);
        expect(fakeMongoQuery.collection()).toBe(fakeCollectionID);
      });
    });
    describe("table()", () => {
      it("returns null for a non-mongo query", () => {
        expect(query.table()).toBe(null);
        expect(query.setQueryText("SELECT * FROM ORDERS").table()).toBe(null);
      });
    });
  });

  describe("Accessing the underlying native query", () => {
    test("You can access the actual native query via queryText()", () => {
      expect(makeQuery("SELECT * FROM ORDERS").queryText()).toEqual(
        "SELECT * FROM ORDERS",
      );
    });
    test("You can update query text the same way as well via setQueryText(newQueryText)", () => {
      const newQuery = makeQuery("SELECT 1");
      expect(newQuery.queryText()).toEqual("SELECT 1");
      const newerQuery = newQuery.setQueryText("SELECT 2");
      expect(newerQuery.queryText()).toEqual("SELECT 2");
    });
    test("lineCount() lets you know how long your query is", () => {
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
        expect(tagMaps["max_price"]["display-name"]).toEqual("Max Price");
      });
    });

    describe("Invalid template tags should prevent the query from running", () => {
      let q = makeQuery().setQueryText("SELECT * from ORDERS where {{foo}}");

      it("base case", () => {
        expect(q.canRun()).toBe(true);
      });

      it("requires a display name", () => {
        q = q.setDatasetQuery(
          assocIn(q.datasetQuery(), ["native", "template-tags", "foo"], {
            name: "foo",
            type: "text",
          }),
        );

        expect(q.canRun()).toBe(false);

        q = q.setDatasetQuery(
          assocIn(q.datasetQuery(), ["native", "template-tags", "foo"], {
            name: "foo",
            type: "text",
            "display-name": "Foo",
          }),
        );

        expect(q.canRun()).toBe(true);
      });

      it("dimension type without a dimension", () => {
        q = q.setDatasetQuery(
          assocIn(q.datasetQuery(), ["native", "template-tags", "foo"], {
            type: "dimension",
            "widget-type": "category",
            "display-name": "bar",
          }),
        );

        expect(q.canRun()).toBe(false);

        q = q.setDatasetQuery(
          assocIn(q.datasetQuery(), ["native", "template-tags", "foo"], {
            name: "foo",
            type: "dimension",
            "widget-type": "category",
            dimension: ["field", 123, null],
            "display-name": "bar",
          }),
        );

        expect(q.canRun()).toBe(true);
      });
    });

    describe("snippet template tags", () => {
      it("should parse snippet tags", () => {
        const q = makeQuery().setQueryText("{{ snippet: foo }}");
        const [
          { "snippet-name": snippetName, "display-name": displayName, type },
        ] = q.templateTags();
        expect(snippetName).toEqual("foo");
        expect(displayName).toEqual("Snippet: Foo");
        expect(type).toEqual("snippet");
      });
      it("should update query text with new snippet names", () => {
        const q = makeQuery()
          .setQueryText("{{ snippet: foo }}")
          .updateSnippetsWithIds([{ id: 123, name: "foo" }])
          .updateSnippetNames([{ id: 123, name: "bar" }]);
        expect(q.queryText()).toEqual("{{snippet: bar}}");
      });
      it("should update snippet names that differ on spacing", () => {
        const q = makeQuery()
          .setQueryText("{{ snippet: foo }} {{snippet:  foo  }}")
          .updateSnippetsWithIds([{ id: 123, name: "foo" }])
          .updateSnippetNames([{ id: 123, name: "bar" }]);
        expect(q.queryText()).toEqual("{{snippet: bar}} {{snippet: bar}}");
      });
    });
    describe("card template tags", () => {
      it("should parse card tags", () => {
        const q = makeQuery().setQueryText(
          "{{#1}} {{ #2 }} {{ #1-a-card-name }} {{ #1-a-card-name }}",
        );
        expect(q.templateTags().map(v => v["card-id"])).toEqual([1, 2, 1]);
      });
    });
  });
  describe("values source settings", () => {
    it("should preserve the order of templates tags when updating", () => {
      const oldQuery = makeQuery().setQueryText(
        "SELECT * FROM PRODUCTS WHERE {{t1}} AND {{t2}}",
      );
      const newQuery = oldQuery.setTemplateTag(
        "t1",
        oldQuery.templateTagsMap()["t1"],
      );

      expect(oldQuery.templateTags()).toEqual(newQuery.templateTags());
    });

    it("should allow setting source settings for tags", () => {
      const oldQuery = makeQuery().setQueryText(
        "SELECT * FROM PRODUCTS WHERE {{t1}} AND {{t2}}",
      );
      const newQuery = oldQuery.setTemplateTagConfig(
        oldQuery.templateTagsMap()["t1"],
        {
          values_query_type: "search",
          values_source_type: "static-list",
          values_source_config: { values: ["A"] },
        },
      );

      const newParameters = newQuery.question().parameters();
      expect(newParameters).toHaveLength(2);
      expect(newParameters[0].values_query_type).toEqual("search");
      expect(newParameters[0].values_source_type).toEqual("static-list");
      expect(newParameters[0].values_source_config).toEqual({ values: ["A"] });
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
      expect(variables.map(v => v.displayName())).toEqual(["Category"]);
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
          dimension: ["field", PRODUCTS.CATEGORY, null],
        });
      const dimensions = q.dimensionOptions().dimensions;
      expect(dimensions).toHaveLength(1);
      expect(dimensions.map(d => d.displayName())).toEqual(["Category"]);
    });
  });

  describe("updateCardTemplateTagNames", () => {
    it("should update the query text with new tag names", () => {
      const query = makeQuery().setQueryText("{{#123-foo}} {{#1234-bar}}");
      const newCards = [{ id: 123, name: "Foo New" }]; // newCards is deliberately missing a the bar card
      const templateTagsMap = updateCardTemplateTagNames(
        query,
        newCards,
      ).templateTagsMap();
      const fooTag = templateTagsMap["#123-foo-new"]; // foo's templateTagsMap key is updated
      const barTag = templateTagsMap["#1234-bar"]; // bar's key isn't updated
      expect(fooTag["card-id"]).toEqual(123); // foo's card-id is the same
      expect(fooTag["name"]).toEqual("#123-foo-new"); // foo's name is updated
      expect(barTag["card-id"]).toEqual(1234); // bar's card-id is the same
      expect(barTag["name"]).toEqual("#1234-bar"); // bar's name is the same
    });
  });
});
