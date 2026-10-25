import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";

import { getPermissionsDatabase, getPermissionsDatabases } from "./databases";

const DATABASE_ID = 2;

const LISTED = createMockDatabase({
  id: DATABASE_ID,
  name: "Routed",
  router_user_attribute: "department",
});

const WITH_TABLES = createMockDatabase({
  id: DATABASE_ID,
  name: "Routed",
  router_user_attribute: undefined,
  tables: [createMockTable({ id: 10, db_id: DATABASE_ID, schema: "public" })],
});

describe("getPermissionsDatabase", () => {
  it("takes the routing attribute from the list and the tables from the metadata", () => {
    const database = getPermissionsDatabase(
      [LISTED],
      { [DATABASE_ID]: WITH_TABLES },
      DATABASE_ID,
    );

    expect(database?.router_user_attribute).toBe("department");
    expect(database?.tables).toHaveLength(1);
  });

  it("keeps the routing attribute when the tables have not loaded", () => {
    const database = getPermissionsDatabase([LISTED], {}, DATABASE_ID);

    expect(database?.router_user_attribute).toBe("department");
    expect(database?.tables).toBeUndefined();
  });

  it("keeps the tables when the list has not loaded", () => {
    const database = getPermissionsDatabase(
      undefined,
      { [DATABASE_ID]: WITH_TABLES },
      DATABASE_ID,
    );

    expect(database?.tables).toHaveLength(1);
  });

  it("is undefined when neither request has landed", () => {
    expect(getPermissionsDatabase(undefined, {}, DATABASE_ID)).toBeUndefined();
  });
});

describe("getPermissionsDatabases", () => {
  it("merges every listed database with its tables", () => {
    const [database] = getPermissionsDatabases([LISTED], {
      [DATABASE_ID]: WITH_TABLES,
    });

    expect(database.router_user_attribute).toBe("department");
    expect(database.tables).toHaveLength(1);
  });
});
