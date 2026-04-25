import { DataPermissionValue } from "metabase/admin/permissions/types";
import type { Group, GroupsPermissions } from "metabase-types/api";

import {
  TRANSFORMS_PERMISSION_OPTIONS,
  buildTransformsPermission,
} from "./transforms-permission";

const defaultGroupId = 1;
const groupId = 2;
const databaseId = 1;

const getPermissionGraph = ({
  transformsValue = "no",
  viewDataValue = "unrestricted",
  createQueriesValue = "query-builder-and-native",
}: {
  transformsValue?: string;
  viewDataValue?: string;
  createQueriesValue?: string;
} = {}): GroupsPermissions =>
  ({
    [defaultGroupId]: {
      [databaseId]: {
        transforms: "yes",
        "view-data": "unrestricted",
        "create-queries": "query-builder-and-native",
      },
    },
    [groupId]: {
      [databaseId]: {
        transforms: transformsValue,
        "view-data": viewDataValue,
        "create-queries": createQueriesValue,
      },
    },
  }) as GroupsPermissions;

const isAdmin = true;
const isNotAdmin = false;

const defaultGroup: Group = {
  id: defaultGroupId,
  name: "All Users",
} as Group;

describe("buildTransformsPermission", () => {
  describe("permission subject restrictions", () => {
    it("returns null for tables level", () => {
      const permissionModel = buildTransformsPermission(
        { databaseId, schemaName: "schema" },
        groupId,
        isNotAdmin,
        getPermissionGraph(),
        defaultGroup,
        "tables",
      );

      expect(permissionModel).toBeNull();
    });

    it("returns null for fields level", () => {
      const permissionModel = buildTransformsPermission(
        { databaseId, schemaName: "schema", tableId: 1 },
        groupId,
        isNotAdmin,
        getPermissionGraph(),
        defaultGroup,
        "fields",
      );

      expect(permissionModel).toBeNull();
    });

    it("returns permission config for schemas level (database level)", () => {
      const permissionModel = buildTransformsPermission(
        { databaseId },
        groupId,
        isNotAdmin,
        getPermissionGraph(),
        defaultGroup,
        "schemas",
      );

      expect(permissionModel).not.toBeNull();
      expect(permissionModel?.permission).toBe("transforms");
      expect(permissionModel?.type).toBe("transforms");
    });
  });

  describe("permission values", () => {
    it("sets correct permission and type fields", () => {
      const permissionModel = buildTransformsPermission(
        { databaseId },
        groupId,
        isNotAdmin,
        getPermissionGraph({ transformsValue: "yes" }),
        defaultGroup,
        "schemas",
      );

      expect(permissionModel?.value).toBe("yes");
      expect(permissionModel?.type).toBe("transforms");
      expect(permissionModel?.permission).toBe("transforms");
    });

    it("returns 'no' value when transforms permission is not set in graph", () => {
      const permissions = {
        [defaultGroupId]: {
          [databaseId]: {
            "view-data": "unrestricted",
            "create-queries": "query-builder-and-native",
          },
        },
        [groupId]: {
          [databaseId]: {
            "view-data": "unrestricted",
            "create-queries": "query-builder-and-native",
          },
        },
      } as GroupsPermissions;

      const permissionModel = buildTransformsPermission(
        { databaseId },
        groupId,
        isNotAdmin,
        permissions,
        defaultGroup,
        "schemas",
      );

      expect(permissionModel?.value).toBe("no");
    });
  });

  describe("admin permissions", () => {
    it("disables permission editing for admins", () => {
      const permissionModel = buildTransformsPermission(
        { databaseId },
        groupId,
        isAdmin,
        getPermissionGraph(),
        defaultGroup,
        "schemas",
      );

      expect(permissionModel?.isDisabled).toBe(true);
      expect(permissionModel?.isHighlighted).toBe(true);
      expect(permissionModel?.disabledTooltip).toBe(
        "Administrators always have the highest level of access to everything in Metabase.",
      );
    });
  });

  describe("prerequisite permissions", () => {
    it("is disabled when view-data is not unrestricted", () => {
      const permissionModel = buildTransformsPermission(
        { databaseId },
        groupId,
        isNotAdmin,
        getPermissionGraph({ viewDataValue: "blocked" }),
        defaultGroup,
        "schemas",
      );

      expect(permissionModel?.isDisabled).toBe(true);
      expect(permissionModel?.disabledTooltip).toBe(
        'Transforms require "Can view" data access and "Query builder and native" for all tables in this database',
      );
    });

    it("is disabled when create-queries is not query-builder-and-native", () => {
      const permissionModel = buildTransformsPermission(
        { databaseId },
        groupId,
        isNotAdmin,
        getPermissionGraph({ createQueriesValue: "query-builder" }),
        defaultGroup,
        "schemas",
      );

      expect(permissionModel?.isDisabled).toBe(true);
      expect(permissionModel?.disabledTooltip).toBe(
        'Transforms require "Can view" data access and "Query builder and native" for all tables in this database',
      );
    });

    it("is disabled when create-queries is 'no'", () => {
      const permissionModel = buildTransformsPermission(
        { databaseId },
        groupId,
        isNotAdmin,
        getPermissionGraph({ createQueriesValue: "no" }),
        defaultGroup,
        "schemas",
      );

      expect(permissionModel?.isDisabled).toBe(true);
    });

    it("forces value to 'no' when prerequisites are not met", () => {
      const permissionModel = buildTransformsPermission(
        { databaseId },
        groupId,
        isNotAdmin,
        getPermissionGraph({
          transformsValue: "yes",
          viewDataValue: "blocked",
        }),
        defaultGroup,
        "schemas",
      );

      expect(permissionModel?.value).toBe("no");
    });

    it("is enabled when both view-data and create-queries prerequisites are met", () => {
      const permissionModel = buildTransformsPermission(
        { databaseId },
        groupId,
        isNotAdmin,
        getPermissionGraph(),
        defaultGroup,
        "schemas",
      );

      expect(permissionModel?.isDisabled).toBe(false);
      expect(permissionModel?.disabledTooltip).toBeNull();
    });
  });

  describe("permission options", () => {
    it("includes only 'no' and 'yes' options", () => {
      const permissionModel = buildTransformsPermission(
        { databaseId },
        groupId,
        isNotAdmin,
        getPermissionGraph(),
        defaultGroup,
        "schemas",
      );

      expect(permissionModel?.options).toStrictEqual([
        TRANSFORMS_PERMISSION_OPTIONS.no,
        TRANSFORMS_PERMISSION_OPTIONS.yes,
      ]);
    });
  });

  describe("confirmations and warnings", () => {
    it("warns when group permission is changing to more restrictive than the default group permission", () => {
      const permissionModel = buildTransformsPermission(
        { databaseId },
        groupId,
        isNotAdmin,
        getPermissionGraph({ transformsValue: "yes" }),
        defaultGroup,
        "schemas",
      );

      const [downgradePermissionConfirmation] =
        permissionModel?.confirmations?.(DataPermissionValue.NO) ?? [];

      expect(downgradePermissionConfirmation?.message).toBe(
        'The "All Users" group has a higher level of access than this, which will override this setting. You should limit or revoke the "All Users" group\'s access to this item.',
      );
    });

    it("shows warning when group permission is already more restrictive than the default group", () => {
      const permissionModel = buildTransformsPermission(
        { databaseId },
        groupId,
        isNotAdmin,
        getPermissionGraph({ transformsValue: "no" }),
        defaultGroup,
        "schemas",
      );

      expect(permissionModel?.warning).toBe(
        'The "All Users" group has a higher level of access than this, which will override this setting. You should limit or revoke the "All Users" group\'s access to this item.',
      );
    });

    it("does not show warning when group has same or higher permission than default group", () => {
      const permissions = {
        [defaultGroupId]: {
          [databaseId]: {
            transforms: "no",
            "view-data": "unrestricted",
            "create-queries": "query-builder-and-native",
          },
        },
        [groupId]: {
          [databaseId]: {
            transforms: "yes",
            "view-data": "unrestricted",
            "create-queries": "query-builder-and-native",
          },
        },
      } as GroupsPermissions;

      const permissionModel = buildTransformsPermission(
        { databaseId },
        groupId,
        isNotAdmin,
        permissions,
        defaultGroup,
        "schemas",
      );

      expect(permissionModel?.warning).toBeNull();
    });
  });
});
