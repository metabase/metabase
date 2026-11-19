import fetchMock from "fetch-mock";

import {
  createMockDatabase,
  createMockField,
  createMockTable,
} from "metabase-types/api/mocks";

import { setupDatabasesEndpoints } from "./database";

const field = createMockField({ id: 3, table_id: 2, semantic_type: "type/PK" });
const table = createMockTable({
  id: 2,
  db_id: 1,
  schema: "public",
  fields: [field, createMockField({ id: 4, table_id: 2, name: "Second" })],
});
const database = createMockDatabase({ id: 1, tables: [table] });

describe.each([undefined, false, true])(
  "database fixtures with readOnly=%s",
  (readOnly) => {
    beforeEach(() => {
      setupDatabasesEndpoints(
        [database],
        readOnly === undefined ? undefined : { readOnly },
      );
    });

    it("preserves database, schema, table, and field reads", async () => {
      const get = async (path: string) =>
        (await fetchMock.fetchHandler(path)).json();

      expect(await get("/api/database")).toMatchObject({
        data: [{ id: 1 }],
        total: 1,
      });
      expect(await get("/api/database?saved=true")).toMatchObject({ total: 2 });
      expect(await get("/api/database/1")).toMatchObject({
        id: 1,
        tables: [{ id: 2 }],
      });
      expect(await get("/api/database/1/schemas")).toEqual(["public"]);
      expect(await get("/api/database/1/syncable_schemas")).toEqual(["public"]);
      expect(await get("/api/database/1/schema/public")).toMatchObject([
        { id: 2 },
      ]);
      expect(await get("/api/database/1/idfields")).toMatchObject([
        { id: 3, table: { id: 2 } },
      ]);
      expect(await get("/api/database/1/healthcheck")).toEqual({
        status: "ok",
      });
      expect(await get("/api/table/2")).toMatchObject({ id: 2, db: { id: 1 } });
      expect(await get("/api/table/2/fks")).toEqual([]);
      expect(await get("/api/table/2/query_metadata")).toMatchObject({
        id: 2,
        fields: [{ id: 3 }, { id: 4 }],
      });
      expect(await get("/api/field/3")).toMatchObject({
        id: 3,
        table: { id: 2, db: { id: 1 } },
      });
      expect(
        await get("/api/field/4?include_sensitive_fields=true"),
      ).toMatchObject({
        id: 4,
        name: "Second",
        table: { id: 2, db: { id: 1 } },
      });
    });

    it("does not accept reads for fields absent from the fixture", async () => {
      fetchMock.catch(418);
      const response = await fetchMock.fetchHandler("/api/field/999");
      expect(response.status).toBe(418);
    });

    it.each([
      ["POST", "/api/database"],
      ["PUT", "/api/database/1"],
      ["POST", "/api/database/1/sync_schema"],
      ["POST", "/api/database/1/rescan_values"],
      ["POST", "/api/database/1/discard_values"],
      ["PUT", "/api/table/2"],
      ["PUT", "/api/table/2/fields/order"],
      ["POST", "/api/table/2/rescan_values"],
      ["POST", "/api/table/2/discard_values"],
      ["POST", "/api/table/2/sync_schema"],
      ["PUT", "/api/field/3"],
      ["POST", "/api/field/3/rescan_values"],
      ["POST", "/api/field/3/discard_values"],
    ])("only handles %s %s in normal mode", async (method, url) => {
      // An explicit fallback lets this fixture test observe missing routes. App
      // tests have no fallback and still fail on unexpected maintenance writes.
      fetchMock.catch(418);
      const response = await fetchMock.fetchHandler(
        new Request(`http://localhost${url}`, {
          method,
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }),
      );
      expect(response.status).toBe(readOnly ? 418 : 200);
    });
  },
);
