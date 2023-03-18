import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";

import Databases from "metabase/entities/databases";

describe("database entity", () => {
  let store;
  beforeEach(() => {
    store = getStore();
  });

  it("should save database metadata in redux", async () => {
    fetchMock.get("path:/api/database/123/metadata", {
      id: 123,
      tables: [{ schema: "public", id: 234, db_id: 123, fields: [] }],
    });

    await store.dispatch(
      Databases.objectActions.fetchDatabaseMetadata({ id: 123 }),
    );
    const { databases, schemas, tables } = store.getState().entities;
    expect(databases).toEqual({
      123: {
        id: 123,
        tables: [234],
        is_saved_questions: false,
      },
    });
    expect(schemas).toEqual({
      "123:public": {
        database: 123,
        id: "123:public",
        name: "public",
      },
    });
    expect(tables).toEqual({
      234: {
        db_id: 123,
        fields: [],
        id: 234,
        schema: "123:public",
        schema_name: "public",
      },
    });
  });
});
