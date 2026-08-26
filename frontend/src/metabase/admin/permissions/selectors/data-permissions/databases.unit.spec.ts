import { QueryStatus } from "@reduxjs/toolkit/query";

import type { State } from "metabase/redux/store";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";

import { getPermissionsDatabase, getPermissionsDatabases } from "./databases";

const DATABASE_ID = 2;

// `GET /api/database` hydrates router_user_attribute but returns no tables.
const LISTED = createMockDatabase({
  id: DATABASE_ID,
  name: "Routed",
  router_user_attribute: "department",
});

// `GET /api/database/:id/metadata` returns tables but no router_user_attribute.
// Its response is kept in permissions state, since its cache entry is dropped
// when the admin navigates away.
const WITH_TABLES = createMockDatabase({
  id: DATABASE_ID,
  name: "Routed",
  router_user_attribute: undefined,
  tables: [createMockTable({ id: 10, db_id: DATABASE_ID, schema: "public" })],
});

const fulfilled = (
  endpointName: string,
  originalArgs: unknown,
  data: unknown,
) => ({
  status: QueryStatus.fulfilled,
  data,
  error: undefined,
  originalArgs,
  requestId: `test-${endpointName}`,
  endpointName,
  startedTimeStamp: 0,
  fulfilledTimeStamp: 0,
});

function setup({ listed = true, withTables = true } = {}) {
  const state = createMockState();
  // The api cache is keyed by RTK's serialized args, which createMockState does
  // not model, so the seeded slice is built by hand.
  return {
    ...state,
    admin: {
      ...state.admin,
      permissions: {
        ...state.admin.permissions,
        databasesWithTables: withTables ? { [DATABASE_ID]: WITH_TABLES } : {},
      },
    },
    "metabase-api": {
      queries: listed
        ? {
            "listDatabases(undefined)": fulfilled("listDatabases", undefined, {
              data: [LISTED],
              total: 1,
            }),
          }
        : {},
    },
  } as unknown as State;
}

describe("getPermissionsDatabase", () => {
  it("takes the routing attribute from the list and the tables from the metadata", () => {
    const database = getPermissionsDatabase(setup(), DATABASE_ID);

    expect(database?.router_user_attribute).toBe("department");
    expect(database?.tables).toHaveLength(1);
  });

  it("keeps the routing attribute when the tables have not loaded", () => {
    const database = getPermissionsDatabase(
      setup({ withTables: false }),
      DATABASE_ID,
    );

    expect(database?.router_user_attribute).toBe("department");
    expect(database?.tables).toBeUndefined();
  });

  it("keeps the tables when the list has not loaded", () => {
    const database = getPermissionsDatabase(
      setup({ listed: false }),
      DATABASE_ID,
    );

    expect(database?.tables).toHaveLength(1);
  });

  it("is undefined when neither request has landed", () => {
    expect(
      getPermissionsDatabase(
        setup({ listed: false, withTables: false }),
        DATABASE_ID,
      ),
    ).toBeUndefined();
  });
});

describe("getPermissionsDatabases", () => {
  it("merges every listed database with its tables", () => {
    const [database] = getPermissionsDatabases(setup());

    expect(database.router_user_attribute).toBe("department");
    expect(database.tables).toHaveLength(1);
  });
});
