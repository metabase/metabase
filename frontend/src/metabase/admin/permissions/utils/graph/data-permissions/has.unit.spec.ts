import _ from "underscore";

import {
  DataPermission,
  DataPermissionValue,
} from "metabase/admin/permissions/types";
import { PLUGIN_ADVANCED_PERMISSIONS } from "metabase/plugins";
import type { GroupsPermissions } from "metabase-types/api";

import { hasPermissionValueInSubgraph } from "./has";

describe("data permissions", () => {
  describe("hasPermissionValueInSubgraph", () => {
    it("should handle database entity ids", async () => {
      const schemas = [{ name: "", getTables: () => [{ id: 1 }, { id: 2 }] }];
      const database = {
        schemas,
        schema: (name: string) => schemas.find(schema => schema.name === name),
      };

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
      const schemas = [
        { name: "public", getTables: () => [{ id: 1 }] },
        { name: "public2", getTables: () => [{ id: 2 }] },
      ];
      const database = {
        schemas,
        schema: (name: string) => schemas.find(schema => schema.name === name),
      };

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
      const schemas = [
        { name: "public", getTables: () => [{ id: 1 }] },
        { name: "public2", getTables: () => [{ id: 2 }] },
      ];
      const database = {
        schemas,
        schema: (name: string) => schemas.find(schema => schema.name === name),
      };

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
      const schemas = [
        { name: "public", getTables: () => [{ id: 1 }] },
        { name: "public2", getTables: () => [{ id: 2 }] },
      ];
      const database = {
        schemas,
        schema: (name: string) => schemas.find(schema => schema.name === name),
      };

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
