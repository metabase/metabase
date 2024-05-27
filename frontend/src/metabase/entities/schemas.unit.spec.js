import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import { Api } from "metabase/api";
import Questions from "metabase/entities/questions";
import Schemas from "metabase/entities/schemas";
import {
  ROOT_COLLECTION_VIRTUAL_SCHEMA,
  SAVED_QUESTIONS_VIRTUAL_DB_ID,
} from "metabase-lib/v1/metadata/utils/saved-questions";

describe("schema entity", () => {
  let store;
  beforeEach(() => {
    store = getStore(
      {
        [Api.reducerPath]: Api.reducer,
      },
      {},
      [Api.middleware],
    );
  });

  it("should save metadata from fetching a schema's tables", async () => {
    fetchMock.get("path:/api/database/1/schema/public", [
      { id: 123, name: "foo" },
      { id: 234, name: "bar" },
    ]);

    await store.dispatch(Schemas.actions.fetch({ id: "1:public" }));
    const { schemas, tables } = store.getState().entities;
    expect(schemas).toEqual({
      "1:public": {
        database: "1",
        id: "1:public",
        name: "public",
        tables: [123, 234],
      },
    });
    expect(tables).toEqual({
      123: { id: 123, name: "foo" },
      234: { id: 234, name: "bar" },
    });
  });

  it("should save metadata from listing schemas", async () => {
    fetchMock.get("path:/api/database/1/schemas", ["foo", "bar"]);

    await store.dispatch(Schemas.actions.fetchList({ dbId: "1" }));
    const { schemas } = store.getState().entities;
    expect(schemas).toEqual({
      "1:bar": { database: "1", id: "1:bar", name: "bar" },
      "1:foo": { database: "1", id: "1:foo", name: "foo" },
    });
  });

  it("should handle schema-less databases", async () => {
    fetchMock.get("path:/api/database/1/schemas", [""]);

    await store.dispatch(Schemas.actions.fetchList({ dbId: "1" }));
    const { schemas } = store.getState().entities;
    expect(schemas).toEqual({ "1:": { database: "1", id: "1:", name: "" } });
  });

  it("should fetch schema tables for a schema-less database", async () => {
    fetchMock.get("path:/api/database/1/schema/", [
      { id: 123, name: "foo" },
      { id: 234, name: "bar" },
    ]);

    await store.dispatch(Schemas.actions.fetch({ id: "1:" }));
    const { schemas, tables } = store.getState().entities;
    expect(schemas).toEqual({
      "1:": {
        database: "1",
        id: "1:",
        name: "",
        tables: [123, 234],
      },
    });
    expect(tables).toEqual({
      123: { id: 123, name: "foo" },
      234: { id: 234, name: "bar" },
    });
  });

  describe("saved questions schema | reducer", () => {
    function getQuestion({
      id = 5,
      name = "Q1",
      collection = null,
      dataset_query = { database: 1 },
      archived = false,
    } = {}) {
      return {
        id,
        name,
        collection,
        dataset_query,
        archived,
      };
    }

    function getCreateAction(question) {
      return {
        type: Questions.actionTypes.CREATE,
        payload: {
          question,
          object: question,
        },
      };
    }

    function getUpdateAction(question) {
      return {
        type: Questions.actionTypes.UPDATE,
        payload: {
          question,
          object: question,
        },
      };
    }

    it("should add new question ID to collection schema tables", () => {
      const question = getQuestion();

      const nextState = Schemas.reducer(
        {
          [ROOT_COLLECTION_VIRTUAL_SCHEMA]: {
            tables: ["card__123"],
          },
        },
        getCreateAction(question),
      );

      expect(nextState).toEqual({
        [ROOT_COLLECTION_VIRTUAL_SCHEMA]: {
          tables: ["card__123", `card__${question.id}`],
        },
      });
    });

    it("should add new question ID to it's collection schema correctly", () => {
      const question = getQuestion({
        collection: { id: 4, name: "Marketing" },
      });

      const nextState = Schemas.reducer(
        {
          [ROOT_COLLECTION_VIRTUAL_SCHEMA]: {
            tables: ["card__123"],
          },
          "-1337:Marketing": {
            tables: ["card__51"],
          },
        },
        getCreateAction(question),
      );

      expect(nextState).toEqual({
        [ROOT_COLLECTION_VIRTUAL_SCHEMA]: {
          tables: ["card__123"],
        },
        "-1337:Marketing": {
          tables: ["card__51", `card__${question.id}`],
        },
      });
    });

    it("should create collection schema's tables when adding a saved question", () => {
      const question = getQuestion();

      const nextState = Schemas.reducer(
        {
          [ROOT_COLLECTION_VIRTUAL_SCHEMA]: {},
        },
        getCreateAction(question),
      );

      expect(nextState).toEqual({
        [ROOT_COLLECTION_VIRTUAL_SCHEMA]: {
          tables: [`card__${question.id}`],
        },
      });
    });

    it("should not add new question ID if it's already present", () => {
      const question = getQuestion();
      const id = `card__${question.id}`;

      const nextState = Schemas.reducer(
        {
          [ROOT_COLLECTION_VIRTUAL_SCHEMA]: {
            tables: [id],
          },
        },
        getCreateAction(getQuestion()),
      );

      expect(nextState).toEqual({
        [ROOT_COLLECTION_VIRTUAL_SCHEMA]: {
          tables: [id],
        },
      });
    });

    it("should not add new ID if it's collection schema is not present in store", () => {
      const nextState = Schemas.reducer(
        {
          [ROOT_COLLECTION_VIRTUAL_SCHEMA]: {
            tables: ["card__123"],
          },
        },
        getCreateAction(getQuestion({ collection: { id: 3, name: "foo" } })),
      );

      expect(nextState).toEqual({
        [ROOT_COLLECTION_VIRTUAL_SCHEMA]: {
          tables: ["card__123"],
        },
      });
    });

    it("should remove question ID from it's collection schema when question is archived", () => {
      const question = getQuestion();

      const nextState = Schemas.reducer(
        {
          [ROOT_COLLECTION_VIRTUAL_SCHEMA]: {
            id: ROOT_COLLECTION_VIRTUAL_SCHEMA,
            tables: ["card__123", `card__${question.id}`],
          },
        },
        getUpdateAction(getQuestion({ ...question, archived: true })),
      );

      expect(nextState).toEqual({
        [ROOT_COLLECTION_VIRTUAL_SCHEMA]: {
          id: ROOT_COLLECTION_VIRTUAL_SCHEMA,
          tables: ["card__123"],
        },
      });
    });

    it("should add question ID to collection schema tables when question is unarchived", () => {
      const question = getQuestion();

      const nextState = Schemas.reducer(
        {
          [ROOT_COLLECTION_VIRTUAL_SCHEMA]: {
            tables: ["card__123"],
          },
        },
        getUpdateAction(question),
      );

      expect(nextState).toEqual({
        [ROOT_COLLECTION_VIRTUAL_SCHEMA]: {
          tables: ["card__123", `card__${question.id}`],
        },
      });
    });

    it("should add question ID when it is unarchived if collection schema is not present in store", () => {
      const nextState = Schemas.reducer(
        {
          [ROOT_COLLECTION_VIRTUAL_SCHEMA]: {
            tables: ["card__123"],
          },
        },
        getUpdateAction(getQuestion({ collection: { id: 3, name: "foo" } })),
      );

      expect(nextState).toEqual({
        [ROOT_COLLECTION_VIRTUAL_SCHEMA]: {
          tables: ["card__123"],
        },
        [`${SAVED_QUESTIONS_VIRTUAL_DB_ID}:foo`]: {
          id: `${SAVED_QUESTIONS_VIRTUAL_DB_ID}:foo`,
          name: "foo",
          database: SAVED_QUESTIONS_VIRTUAL_DB_ID,
        },
      });
    });
  });
});
