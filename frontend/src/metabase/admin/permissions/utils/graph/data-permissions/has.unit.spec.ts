import {
  DataPermission,
  DataPermissionValue,
} from "metabase/admin/permissions/types";
import type { DatabasePermissionInfo } from "metabase/admin/permissions/utils/database-metadata";
import { PLUGIN_ADVANCED_PERMISSIONS } from "metabase/plugins";
import type { GroupsPermissions } from "metabase-types/api";

import { hasPermissionValueInSubgraph } from "./has";

/**
 * Helper to create a mock database that satisfies DatabasePermissionInfo.
 */
function createMockDatabase(
  schemas: Array<{ name: string; tables: Array<{ id: number }> }>,
): DatabasePermissionInfo {
  const schemaInfos = schemas.map((s) => ({
    name: s.name,
    getTables: () => s.tables.map((t) => ({ id: t.id, db_id: 1, schema_name: s.name || null })),
  }));

  return {
    schemas: schemaInfos,
    schema: (name: string | undefined) =>
      schemaInfos.find((schema) => schema.name === (name ?? "")) ?? null,
    getTables: () =>
      schemas.flatMap((s) =>
        s.tables.map((t) => ({ id: t.id, db_id: 1, schema_name: s.name || null })),
      ),
  };
}

describe("data permissions", () => {
  describe("hasPermissionValueInSubgraph", () => {
    it("should handle database entity ids", async () => {
      const database = createMockDatabase([
        { name: "", tables: [{ id: 1 }, { id: 2 }] },
      ]);

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

      // Test for database 1
      expect(
        hasPermissionValueInSubgraph(
          testPermissions,
          1,
          { databaseId: 1 },
          database,
          DataPermission.VIEW_DATA,
          DataPermissionValue.UNRESTRICTED,
        ),
      ).toBe(true);

      expect(
        hasPermissionValueInSubgraph(
          testPermissions,
          1,
          { databaseId: 1 },
          database,
          DataPermission.CREATE_QUERIES,
          DataPermissionValue.QUERY_BUILDER,
        ),
      ).toBe(true);

      // Test for database 2
      expect(
        hasPermissionValueInSubgraph(
          testPermissions,
          1,
          { databaseId: 2 },
          database,
          DataPermission.VIEW_DATA,
          DataPermissionValue.UNRESTRICTED,
        ),
      ).toBe(false);

      expect(
        hasPermissionValueInSubgraph(
          testPermissions,
          1,
          { databaseId: 2 },
          database,
          DataPermission.CREATE_QUERIES,
          DataPermissionValue.QUERY_BUILDER,
        ),
      ).toBe(false);
    });

    it("should handle databases with multiple schemas", async () => {
      const database = createMockDatabase([
        { name: "public", tables: [{ id: 1 }] },
        { name: "public2", tables: [{ id: 2 }] },
      ]);

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

      expect(
        hasPermissionValueInSubgraph(
          testPermissions,
          1,
          { databaseId: 1 },
          database,
          DataPermission.VIEW_DATA,
          DataPermissionValue.UNRESTRICTED,
        ),
      ).toBe(true);

      expect(
        hasPermissionValueInSubgraph(
          testPermissions,
          1,
          { databaseId: 1 },
          database,
          DataPermission.VIEW_DATA,
          DataPermissionValue.LEGACY_NO_SELF_SERVICE,
        ),
      ).toBe(true);

      expect(
        hasPermissionValueInSubgraph(
          testPermissions,
          1,
          { databaseId: 1 },
          database,
          DataPermission.VIEW_DATA,
          DataPermissionValue.BLOCKED,
        ),
      ).toBe(false);
    });

    it("should handle schema entity ids", async () => {
      const database = createMockDatabase([
        { name: "public", tables: [{ id: 1 }] },
        { name: "public2", tables: [{ id: 2 }] },
      ]);

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
      const database = createMockDatabase([
        { name: "public", tables: [{ id: 1 }] },
        { name: "public2", tables: [{ id: 2 }] },
      ]);

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
