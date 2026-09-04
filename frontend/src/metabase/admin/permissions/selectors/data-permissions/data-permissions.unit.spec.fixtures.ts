import { QueryStatus } from "@reduxjs/toolkit/query";

import { createMockSettingsState } from "metabase/redux/store/mocks";
import type { Database, SchemaName, TableId } from "metabase-types/api";
import {
  createMockDatabase,
  createMockGroup,
  createMockTable,
} from "metabase-types/api/mocks";

import { DataPermission, DataPermissionValue } from "../../types";

const createTables = (
  databaseId: number,
  tablesBySchema: Record<SchemaName, [TableId, string][]>,
) =>
  Object.entries(tablesBySchema).flatMap(([schema, tables]) =>
    tables.map(([id, name]) =>
      createMockTable({
        id,
        db_id: databaseId,
        schema,
        name,
        display_name: name,
      }),
    ),
  );

// Database 2 is an imaginary multi-schema database (like Redshift for instance)
// Database 3 is an imaginary database which doesn't have any schemas (like MySQL)
export const multiSchemaDatabase = createMockDatabase({
  id: 2,
  name: "Imaginary Multi-Schema Dataset",
  tables: createTables(2, {
    schema_1: [
      [5, "Avian Singles Messages"],
      [6, "Avian Singles Users"],
    ],
    schema_2: [
      [7, "Tupac Sightings Sightings"],
      [8, "Tupac Sightings Categories"],
      [9, "Tupac Sightings Cities"],
    ],
  }),
});

export const schemalessDatabase = createMockDatabase({
  id: 3,
  name: "Imaginary Schemaless Dataset",
  tables: createTables(3, {
    "": [
      [10, "Badminton Men's Double Results"],
      [11, "Badminton Mixed Double Results"],
      [12, "Badminton Women's Singles Results"],
      [13, "Badminton Mixed Singles Results"],
    ],
  }),
});

export const destinationDatabase = createMockDatabase({
  id: 4,
  name: "Destination Database",
  tables: [],
  router_database_id: 2,
});

export const databases: Database[] = [
  multiSchemaDatabase,
  schemalessDatabase,
  destinationDatabase,
];

export const groups = {
  "1": createMockGroup({
    id: 1,
    name: "Group starting with full access",
    magic_group_type: null,
  }),
  "2": createMockGroup({
    id: 2,
    name: "Group starting with no access at all",
    magic_group_type: null,
  }),
  "3": createMockGroup({
    id: 3,
    name: "All Users",
    magic_group_type: "all-internal-users",
  }),
};

export const initialPermissions = {
  1: {
    // Sample database
    1: {
      [DataPermission.CREATE_QUERIES]:
        DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
      [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED,
    },
    // Imaginary multi-schema
    2: {
      [DataPermission.CREATE_QUERIES]:
        DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
      [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED,
    },
    // Imaginary schemaless
    3: {
      [DataPermission.CREATE_QUERIES]:
        DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
      [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED,
    },
  },
  2: {
    // Sample database
    1: {
      [DataPermission.CREATE_QUERIES]: DataPermissionValue.NO,
      [DataPermission.VIEW_DATA]: DataPermissionValue.BLOCKED,
    },
    // Imaginary multi-schema
    2: {
      [DataPermission.CREATE_QUERIES]: DataPermissionValue.NO,
      [DataPermission.VIEW_DATA]: DataPermissionValue.BLOCKED,
    },
    // Imaginary schemaless
    3: {
      [DataPermission.CREATE_QUERIES]: DataPermissionValue.NO,
      [DataPermission.VIEW_DATA]: DataPermissionValue.BLOCKED,
    },
  },
};

const fulfilled = (
  endpointName: string,
  originalArgs: unknown,
  data: unknown,
) => ({
  status: QueryStatus.fulfilled,
  data,
  error: undefined,
  originalArgs,
  requestId: `test-request-${endpointName}`,
  endpointName,
  startedTimeStamp: 0,
  fulfilledTimeStamp: 0,
});

// The permissions tree reads its databases straight out of the RTK Query cache,
// so the fixture seeds the same entries DataPermissionsPage subscribes to.
// The tree takes each database's identity from the listDatabases cache and its
// tables from permissions state, so the fixture seeds both.
const databasesWithTables = Object.fromEntries(
  databases.map((database) => [database.id, database]),
);

export const state = {
  admin: {
    permissions: {
      dataPermissions: initialPermissions,
      originalDataPermissions: initialPermissions,
      databasesWithTables,
    },
  },
  settings: createMockSettingsState(),
  "metabase-api": {
    queries: {
      "listPermissionsGroups({})": fulfilled(
        "listPermissionsGroups",
        {},
        Object.values(groups),
      ),
      "listDatabases(undefined)": fulfilled("listDatabases", undefined, {
        data: databases,
        total: databases.length,
      }),
    },
  },
};
