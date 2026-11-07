import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { createMetadataProvider } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { TemplateTag } from "metabase-types/api";
import {
  createMockCard,
  createMockDatabase,
  createMockNativeQuerySnippet,
  createMockTable,
  createMockTemplateTag,
} from "metabase-types/api/mocks";
import {
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import {
  getTemplateTagCardIds,
  getVariableTemplateTags,
  hasSnippetTemplateTags,
  requiresNativeCollection,
  setNativeQueryDatabaseId,
  setTemplateTag,
  setTemplateTagConfig,
  setTemplateTagIndex,
  updateCardTemplateTagNames,
  updateSnippetNames,
} from "./utils";

const MONGO_DB_ID = SAMPLE_DB_ID + 1;
const SNIPPET_ID = 1;

const METADATA = createMockMetadata({
  databases: [
    createSampleDatabase(),
    createMockDatabase({
      id: MONGO_DB_ID,
      engine: "mongo",
      features: ["native-requires-specified-collection"],
      tables: [
        createMockTable({ id: 100, db_id: MONGO_DB_ID, name: "orders" }),
      ],
    }),
  ],
});

function createQuery(queryText: string, templateTags?: TemplateTag[]) {
  const query = Lib.createTestNativeQuery(
    createMetadataProvider({ databaseId: SAMPLE_DB_ID, metadata: METADATA }),
    { query: queryText },
  );
  return templateTags ? Lib.withTemplateTags(query, templateTags) : query;
}

function getTagNames(query: Lib.Query) {
  return Lib.templateTags(query).map((tag) => tag.name);
}

function getTag(query: Lib.Query, name: string) {
  return checkNotNull(Lib.templateTags(query).find((tag) => tag.name === name));
}

describe("querying/native utils", () => {
  describe("getVariableTemplateTags", () => {
    it("should return no tags for query without variables", () => {
      expect(getVariableTemplateTags(createQuery("SELECT 1"))).toEqual([]);
    });

    it("should skip snippet and card tags", () => {
      const query = createQuery("SELECT {{x}} FROM {{#1}}");
      expect(getVariableTemplateTags(query).map((tag) => tag.name)).toEqual([
        "x",
      ]);
    });
  });

  describe("hasSnippetTemplateTags", () => {
    it("should detect snippet tags", () => {
      const query = createQuery("{{snippet: foo}}", [
        createMockTemplateTag({
          name: "snippet: foo",
          type: "snippet",
          "snippet-id": SNIPPET_ID,
          "snippet-name": "foo",
        }),
      ]);
      expect(hasSnippetTemplateTags(query)).toBe(true);
      expect(hasSnippetTemplateTags(createQuery("SELECT {{x}}"))).toBe(false);
    });
  });

  describe("getTemplateTagCardIds", () => {
    it("should return card ids of card tags", () => {
      const query = createQuery("{{#1}} {{ #2 }} {{ #1-a-card-name }} {{x}}");
      expect(getTemplateTagCardIds(query)).toEqual([1, 2, 1]);
    });
  });

  describe("setNativeQueryDatabaseId", () => {
    it("should switch SQL query to Mongo database and pick default collection (metabase#53299)", () => {
      const query = setNativeQueryDatabaseId(
        createQuery("SELECT 1"),
        MONGO_DB_ID,
        METADATA,
      );
      expect(Lib.engine(query)).toBe("mongo");
      expect(requiresNativeCollection(query)).toBe(true);
      expect(Lib.rawNativeQuery(query)).toBe("SELECT 1");
      expect(Lib.nativeExtras(query)?.collection).toBe("orders");
    });

    it("should keep query unchanged for same database", () => {
      const query = createQuery("SELECT 1");
      expect(setNativeQueryDatabaseId(query, SAMPLE_DB_ID, METADATA)).toBe(
        query,
      );
    });
  });

  describe("setTemplateTag", () => {
    it("should preserve tag order when type changes (metabase#11580)", () => {
      const query = createQuery("SELECT {{foo}} {{bar}}");
      const newQuery = setTemplateTag(query, {
        ...getTag(query, "foo"),
        type: "number",
      });
      expect(getTagNames(newQuery)).toEqual(["foo", "bar"]);
      expect(getTag(newQuery, "foo").type).toBe("number");
    });
  });

  describe("setTemplateTagIndex", () => {
    it("should move tag to new index", () => {
      const query = createQuery("SELECT {{a}} {{b}} {{c}}");
      const tagId = getTag(query, "c").id;
      expect(getTagNames(setTemplateTagIndex(query, tagId, 0))).toEqual([
        "c",
        "a",
        "b",
      ]);
    });
  });

  describe("setTemplateTagConfig", () => {
    it("should set values source settings on tag parameter", () => {
      const query = createQuery(
        "SELECT * FROM PRODUCTS WHERE {{t1}} AND {{t2}}",
      );
      const question = Question.create({ metadata: METADATA }).setQuery(query);
      const newQuestion = setTemplateTagConfig(question, getTag(query, "t1"), {
        values_query_type: "search",
        values_source_type: "static-list",
        values_source_config: { values: ["A"] },
      });

      const parameters = newQuestion.parameters();
      expect(parameters).toHaveLength(2);
      expect(parameters[0]).toMatchObject({
        values_query_type: "search",
        values_source_type: "static-list",
        values_source_config: { values: ["A"] },
      });
    });
  });

  describe("updateSnippetNames", () => {
    it("should update query text with new snippet names", () => {
      const query = createQuery("{{ snippet: foo }} {{snippet: foo}}", [
        createMockTemplateTag({
          name: "snippet: foo",
          type: "snippet",
          "snippet-id": SNIPPET_ID,
          "snippet-name": "foo",
        }),
      ]);
      const newQuery = updateSnippetNames(query, [
        createMockNativeQuerySnippet({ id: SNIPPET_ID, name: "bar" }),
      ]);
      expect(Lib.rawNativeQuery(newQuery)).toBe(
        "{{snippet: bar}} {{snippet: bar}}",
      );
    });
  });

  describe("updateCardTemplateTagNames", () => {
    it("should rename tags of known cards only", () => {
      const query = createQuery("{{#123-foo}} {{#1234-bar}}");
      const newQuery = updateCardTemplateTagNames(query, [
        createMockCard({ id: 123, name: "Foo New" }),
      ]);
      expect(Lib.rawNativeQuery(newQuery)).toBe(
        "{{#123-foo-new}} {{#1234-bar}}",
      );
      expect(Lib.templateTags(newQuery)).toMatchObject([
        { name: "#123-foo-new", "card-id": 123 },
        { name: "#1234-bar", "card-id": 1234 },
      ]);
    });
  });
});
