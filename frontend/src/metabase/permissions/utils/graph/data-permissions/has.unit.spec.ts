import _ from "underscore";

import { PLUGIN_ADVANCED_PERMISSIONS } from "metabase/plugins";
import {
  DataPermission,
  DataPermissionValue,
  type GroupsPermissions,
  type PermissionsDatabase,
  type SchemaName,
  type TableId,
} from "metabase-types/api";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";

import { hasPermissionValueInSubgraph } from "./has";

const createDatabase = (
  tablesBySchema: Record<SchemaName, TableId[]>,
): PermissionsDatabase =>
  createMockDatabase({
    id: 1,
    tables: Object.entries(tablesBySchema).flatMap(([schema, tableIds]) =>
      tableIds.map((id) => createMockTable({ id, db_id: 1, schema })),
    ),
  });

describe("data permissions", () => {
  describe("hasPermissionValueInSubgraph", () => {
    it("should handle database entity ids", async () => {
      const database = createDatabase({ "": [1, 2] });

      const testPermissions: GroupsPermissions = {
        "1": {
          "1": {
            [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED,
            [DataPermission.CREATE_QUERIES]: DataPermissionValue.QUERY_BUILDER,
          },
          "2": {
            [DataPermission.VIEW_DATA]: DataPermissionValue.BLOCKED,
            [DataPermission.CREATE_QUERIES]:
              DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
          },
        },
      };

      const testFn1 = _.partial(
        hasPermissionValueInSubgraph,
        testPermissions,
        1,
        { databaseId: 1 },
        database,
      );

      expect(
        testFn1(DataPermission.VIEW_DATA, DataPermissionValue.UNRESTRICTED),
      ).toBe(true);
      expect(
        testFn1(
          DataPermission.CREATE_QUERIES,
          DataPermissionValue.QUERY_BUILDER,
        ),
      ).toBe(true);

      const testFn2 = _.partial(
        hasPermissionValueInSubgraph,
        testPermissions,
        1,
        { databaseId: 2 },
        database,
      );

      expect(
        testFn2(DataPermission.VIEW_DATA, DataPermissionValue.UNRESTRICTED),
      ).toBe(false);

      expect(
        testFn2(
          DataPermission.CREATE_QUERIES,
          DataPermissionValue.QUERY_BUILDER,
        ),
      ).toBe(false);
    });

    it("should handle databases with multiple schemas", async () => {
      const database = createDatabase({ public: [1], public2: [2] });

      const testPermissions: GroupsPermissions = {
        "1": {
          "1": {
            [DataPermission.VIEW_DATA]: {
              public: DataPermissionValue.UNRESTRICTED,
              public2: DataPermissionValue.LEGACY_NO_SELF_SERVICE,
            },
          },
        },
      };

      const testFn = _.partial(
        hasPermissionValueInSubgraph,
        testPermissions,
        1,
        { databaseId: 1 },
        database,
        DataPermission.VIEW_DATA,
      );

      expect(testFn(DataPermissionValue.UNRESTRICTED)).toBe(true);
      expect(testFn(DataPermissionValue.LEGACY_NO_SELF_SERVICE)).toBe(true);
      expect(testFn(DataPermissionValue.BLOCKED)).toBe(false);
    });

    it("should handle schema entity ids", async () => {
      const database = createDatabase({ public: [1], public2: [2] });

      const testPermissions: GroupsPermissions = {
        "1": {
          "1": {
            [DataPermission.VIEW_DATA]: {
              public: DataPermissionValue.UNRESTRICTED,
              public2: DataPermissionValue.BLOCKED,
            },
          },
        },
      };

      expect(
        hasPermissionValueInSubgraph(
          testPermissions,
          1,
          { databaseId: 1, schemaName: "public" },
          database,
          DataPermission.VIEW_DATA,
          DataPermissionValue.UNRESTRICTED,
        ),
      ).toBe(true);

      expect(
        hasPermissionValueInSubgraph(
          testPermissions,
          1,
          { databaseId: 1, schemaName: "public2" },
          database,
          DataPermission.VIEW_DATA,
          DataPermissionValue.BLOCKED,
        ),
      ).toBe(true);

      expect(
        hasPermissionValueInSubgraph(
          testPermissions,
          1,
          { databaseId: 1, schemaName: "public" },
          database,
          DataPermission.VIEW_DATA,
          DataPermissionValue.BLOCKED,
        ),
      ).toBe(false);

      expect(
        hasPermissionValueInSubgraph(
          testPermissions,
          1,
          { databaseId: 1, schemaName: "public2" },
          database,
          DataPermission.VIEW_DATA,
          DataPermissionValue.UNRESTRICTED,
        ),
      ).toBe(false);
    });

    it("should handle default permissions omitted from the graph", async () => {
      const database = createDatabase({ public: [1], public2: [2] });

      const testPermissions: GroupsPermissions = {
        "1": {
          "1": {
            [DataPermission.VIEW_DATA]: {
              public: DataPermissionValue.UNRESTRICTED,
              // public2 omitted from graph to indicate blocked
            },
          },
        },
      };

      expect(
        hasPermissionValueInSubgraph(
          testPermissions,
          1,
          { databaseId: 1, schemaName: "public2" },
          database,
          DataPermission.VIEW_DATA,
          PLUGIN_ADVANCED_PERMISSIONS.defaultViewDataPermission,
        ),
      ).toBe(true);

      expect(
        hasPermissionValueInSubgraph(
          testPermissions,
          1,
          { databaseId: 1, schemaName: "public2" },
          database,
          DataPermission.CREATE_QUERIES,
          DataPermissionValue.NO,
        ),
      ).toBe(true);
    });
  });
});
