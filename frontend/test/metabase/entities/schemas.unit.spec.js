import mock from "xhr-mock";

import { getStore } from "__support__/entities-store";

import Schemas from "metabase/entities/schemas";

describe("schema entity", () => {
  let store;
  beforeEach(() => {
    store = getStore();
    mock.setup();
  });

  afterEach(() => mock.teardown());

  it("should save metadata from fetching a schema's tables", async () => {
    mock.get("/api/database/1/schema/public", {
      body: JSON.stringify([
        { id: 123, name: "foo" },
        { id: 234, name: "bar" },
      ]),
    });

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
      "123": { id: 123, name: "foo" },
      "234": { id: 234, name: "bar" },
    });
  });

  it("should save metadata from listing schemas", async () => {
    mock.get("/api/database/1/schemas", {
      body: JSON.stringify(["foo", "bar"]),
    });

    await store.dispatch(Schemas.actions.fetchList({ dbId: "1" }));
    const { schemas } = store.getState().entities;
    expect(schemas).toEqual({
      "1:bar": { database: "1", id: "1:bar", name: "bar" },
      "1:foo": { database: "1", id: "1:foo", name: "foo" },
    });
  });

  it("should handle schema-less databases", async () => {
    mock.get("/api/database/1/schemas", { body: JSON.stringify([""]) });

    await store.dispatch(Schemas.actions.fetchList({ dbId: "1" }));
    const { schemas } = store.getState().entities;
    expect(schemas).toEqual({ "1:": { database: "1", id: "1:", name: "" } });
  });

  it("should fetch schema tables for a schema-less database", async () => {
    mock.get("/api/database/1/schema/", {
      body: JSON.stringify([
        { id: 123, name: "foo" },
        { id: 234, name: "bar" },
      ]),
    });

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
      "123": { id: 123, name: "foo" },
      "234": { id: 234, name: "bar" },
    });
  });
});
