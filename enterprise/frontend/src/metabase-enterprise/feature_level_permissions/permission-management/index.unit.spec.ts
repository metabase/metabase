import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import {
  DataPermissionValue,
  type Group,
  type GroupsPermissions,
} from "metabase-types/api";

import { getFeatureLevelDataPermissions } from "./index";

const defaultGroupId = 1;
const groupId = 2;
const groupType = null;
const databaseId = 1;

const getPermissionGraph = (): GroupsPermissions =>
  // Unjustified type cast. FIXME
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

// Unjustified type cast. FIXME
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
    it("returns 4 permissions including transforms when PLUGIN_TRANSFORMS.isEnabled is true and transforms are enabled on the instance", () => {
      PLUGIN_TRANSFORMS.isEnabled = true;

      const permissions = getFeatureLevelDataPermissions({
        entityId: { databaseId },
        groupId,
        groupType,
        permissions: getPermissionGraph(),
        dataAccessPermissionValue: DataPermissionValue.UNRESTRICTED,
        defaultGroup,
        permissionSubject: "schemas",
        showTransformPermissions: true,
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

    it("returns 3 permissions when the transform token feature is disabled", () => {
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

  describe("tenant groups", () => {
    it("drops the table metadata and database permissions in the group view", () => {
      const permissions = getFeatureLevelDataPermissions({
        entityId: { databaseId },
        groupId,
        groupType: "external",
        permissions: getPermissionGraph(),
        dataAccessPermissionValue: DataPermissionValue.UNRESTRICTED,
        defaultGroup,
        permissionSubject: "schemas",
        permissionView: "group",
      });

      expect(permissions).toHaveLength(1);
      expect(permissions[0]).toMatchObject({ permission: "download" });
    });

    it("keeps them in the database view but locks them, since tenant users never manage a database", () => {
      const permissions = getFeatureLevelDataPermissions({
        entityId: { databaseId },
        groupId,
        groupType: "external",
        permissions: getPermissionGraph(),
        dataAccessPermissionValue: DataPermissionValue.UNRESTRICTED,
        defaultGroup,
        permissionSubject: "schemas",
        permissionView: "database",
      });

      expect(permissions).toHaveLength(3);
      expect(permissions[0]).toMatchObject({
        permission: "download",
        isDisabled: false,
      });
      expect(permissions[1]).toMatchObject({
        permission: "data-model",
        isDisabled: true,
        disabledTooltip: "Tenant users cannot manage database permissions",
      });
      expect(permissions[2]).toMatchObject({
        permission: "details",
        isDisabled: true,
        disabledTooltip: "Tenant users cannot manage database permissions",
      });
    });
  });

  describe("tables subject (schema level)", () => {
    it("returns 2 permissions without transforms regardless of showTransformPermissions", () => {
      PLUGIN_TRANSFORMS.isEnabled = true;

      const permissions = getFeatureLevelDataPermissions({
        entityId: { databaseId, schemaName: "public" },
        groupId,
        groupType,
        permissions: getPermissionGraph(),
        dataAccessPermissionValue: DataPermissionValue.UNRESTRICTED,
        defaultGroup,
        permissionSubject: "tables",
        showTransformPermissions: true,
      });

      expect(permissions).toHaveLength(2);
      expect(permissions[0]).toMatchObject({ permission: "download" });
      expect(permissions[1]).toMatchObject({ permission: "data-model" });
    });
  });

  describe("fields subject (table level)", () => {
    it("returns 2 permissions without transforms regardless of showTransformPermissions", () => {
      const permissions = getFeatureLevelDataPermissions({
        entityId: { databaseId, schemaName: "public", tableId: 1 },
        groupId,
        groupType,
        permissions: getPermissionGraph(),
        dataAccessPermissionValue: DataPermissionValue.UNRESTRICTED,
        defaultGroup,
        permissionSubject: "fields",
        showTransformPermissions: true,
      });

      expect(permissions).toHaveLength(2);
      expect(permissions[0]).toMatchObject({ permission: "download" });
      expect(permissions[1]).toMatchObject({ permission: "data-model" });
    });
  });
});
