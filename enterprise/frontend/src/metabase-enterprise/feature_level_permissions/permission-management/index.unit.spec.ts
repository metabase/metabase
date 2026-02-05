import { DataPermissionValue } from "metabase/admin/permissions/types";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import type { Group, GroupsPermissions } from "metabase-types/api";

import { getFeatureLevelDataPermissions } from "./index";

const defaultGroupId = 1;
const groupId = 2;
const groupType = null;
const databaseId = 1;

const getPermissionGraph = (): GroupsPermissions =>
  ({
    [defaultGroupId]: {
      [databaseId]: {
        download: { schemas: "full" },
        "data-model": { schemas: "all" },
        details: "yes",
        transforms: "yes",
        "view-data": "unrestricted",
        "create-queries": "query-builder-and-native",
      },
    },
    [groupId]: {
      [databaseId]: {
        download: { schemas: "full" },
        "data-model": { schemas: "all" },
        details: "yes",
        transforms: "yes",
        "view-data": "unrestricted",
        "create-queries": "query-builder-and-native",
      },
    },
  }) as any;

const defaultGroup: Group = {
  id: defaultGroupId,
  name: "All Users",
} as Group;

describe("getFeatureLevelDataPermissions", () => {
  const originalIsEnabled = PLUGIN_TRANSFORMS.isEnabled;

  afterEach(() => {
    PLUGIN_TRANSFORMS.isEnabled = originalIsEnabled;
  });

  describe("schemas subject (database level)", () => {
    it("returns 4 permissions including transforms when PLUGIN_TRANSFORMS.isEnabled is true", () => {
      PLUGIN_TRANSFORMS.isEnabled = true;

      const permissions = getFeatureLevelDataPermissions({
        entityId: { databaseId },
        groupId,
        groupType,
        permissions: getPermissionGraph(),
        dataAccessPermissionValue: DataPermissionValue.UNRESTRICTED,
        defaultGroup,
        permissionSubject: "schemas",
      });

      expect(permissions).toHaveLength(4);
      expect(permissions[0]).toMatchObject({ permission: "download" });
      expect(permissions[1]).toMatchObject({ permission: "data-model" });
      expect(permissions[2]).toMatchObject({ permission: "details" });
      expect(permissions[3]).toMatchObject({
        permission: "transforms",
        type: "transforms",
        value: "yes",
        isDisabled: false,
      });
    });

    it("returns 3 permissions without transforms when PLUGIN_TRANSFORMS.isEnabled is false", () => {
      PLUGIN_TRANSFORMS.isEnabled = false;

      const permissions = getFeatureLevelDataPermissions({
        entityId: { databaseId },
        groupId,
        groupType,
        permissions: getPermissionGraph(),
        dataAccessPermissionValue: DataPermissionValue.UNRESTRICTED,
        defaultGroup,
        permissionSubject: "schemas",
      });

      expect(permissions).toHaveLength(3);
      expect(permissions[0]).toMatchObject({ permission: "download" });
      expect(permissions[1]).toMatchObject({ permission: "data-model" });
      expect(permissions[2]).toMatchObject({ permission: "details" });
    });
  });

  describe("tables subject (schema level)", () => {
    it("returns 2 permissions without transforms regardless of PLUGIN_TRANSFORMS.isEnabled", () => {
      PLUGIN_TRANSFORMS.isEnabled = true;

      const permissions = getFeatureLevelDataPermissions({
        entityId: { databaseId, schemaName: "public" },
        groupId,
        groupType,
        permissions: getPermissionGraph(),
        dataAccessPermissionValue: DataPermissionValue.UNRESTRICTED,
        defaultGroup,
        permissionSubject: "tables",
      });

      expect(permissions).toHaveLength(2);
      expect(permissions[0]).toMatchObject({ permission: "download" });
      expect(permissions[1]).toMatchObject({ permission: "data-model" });
    });
  });

  describe("fields subject (table level)", () => {
    it("returns 2 permissions without transforms regardless of PLUGIN_TRANSFORMS.isEnabled", () => {
      PLUGIN_TRANSFORMS.isEnabled = true;

      const permissions = getFeatureLevelDataPermissions({
        entityId: { databaseId, schemaName: "public", tableId: 1 },
        groupId,
        groupType,
        permissions: getPermissionGraph(),
        dataAccessPermissionValue: DataPermissionValue.UNRESTRICTED,
        defaultGroup,
        permissionSubject: "fields",
      });

      expect(permissions).toHaveLength(2);
      expect(permissions[0]).toMatchObject({ permission: "download" });
      expect(permissions[1]).toMatchObject({ permission: "data-model" });
    });
  });
});
