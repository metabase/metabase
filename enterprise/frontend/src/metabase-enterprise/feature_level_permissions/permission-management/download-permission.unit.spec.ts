import { DataPermissionValue } from "metabase/admin/permissions/types";
import type { Group, GroupsPermissions } from "metabase-types/api";

import {
  buildDownloadPermission,
  DOWNLOAD_PERMISSION_OPTIONS,
} from "./download-permission";

const defaultGroupId = 1;
const groupId = 2;

const databaseId = 1;

const getPermissionGraph = (downloadValue = "all"): GroupsPermissions =>
  ({
    [defaultGroupId]: {
      [databaseId]: {
        download: {
          schemas: "all",
        },
      },
    },
    [groupId]: {
      [databaseId]: {
        download: {
          schemas: downloadValue,
        },
      },
    },
  } as any);

const isAdmin = true;
const isNotAdmin = false;
const dataAccessPermissionValue = DataPermissionValue.UNRESTRICTED;

const defaultGroup: Group = {
  id: defaultGroupId,
  name: "All Users",
} as Group;

describe("buildDownloadPermission", () => {
  it("sets correct permission and type fields and value", () => {
    const permissionModel = buildDownloadPermission(
      { databaseId },
      groupId,
      isNotAdmin,
      getPermissionGraph(),
      dataAccessPermissionValue,
      defaultGroup,
      "schemas",
    );

    expect(permissionModel.value).toBe("all");
    expect(permissionModel.type).toBe("download");
    expect(permissionModel.permission).toBe("download");
  });

  it("disables permission editing for admins", () => {
    const permissionModel = buildDownloadPermission(
      { databaseId },
      groupId,
      isAdmin,
      getPermissionGraph(),
      dataAccessPermissionValue,
      defaultGroup,
      "schemas",
    );

    expect(permissionModel.isDisabled).toBe(true);
    expect(permissionModel.disabledTooltip).toBe(
      "Administrators always have the highest level of access to everything in Metabase.",
    );
  });

  it("does not disable permission editing for non-admins", () => {
    const permissionModel = buildDownloadPermission(
      { databaseId },
      groupId,
      isNotAdmin,
      getPermissionGraph(),
      dataAccessPermissionValue,
      defaultGroup,
      "schemas",
    );

    expect(permissionModel.isDisabled).toBe(false);
    expect(permissionModel.disabledTooltip).toBe(null);
  });

  describe("permission options", () => {
    it("include controlled option when the permission is for schemas or tables", () => {
      const schemasPermissionModel = buildDownloadPermission(
        { databaseId },
        groupId,
        isNotAdmin,
        getPermissionGraph(),
        dataAccessPermissionValue,
        defaultGroup,
        "schemas",
      );

      const tablesPermissionModel = buildDownloadPermission(
        { databaseId, schemaName: "schema" },
        groupId,
        isNotAdmin,
        getPermissionGraph(),
        dataAccessPermissionValue,
        defaultGroup,
        "tables",
      );

      const expectedOptions = [
        DOWNLOAD_PERMISSION_OPTIONS.none,
        DOWNLOAD_PERMISSION_OPTIONS.controlled,
        DOWNLOAD_PERMISSION_OPTIONS.limited,
        DOWNLOAD_PERMISSION_OPTIONS.full,
      ];

      expect(schemasPermissionModel.options).toStrictEqual(expectedOptions);
      expect(tablesPermissionModel.options).toStrictEqual(expectedOptions);
    });

    it("does not include controlled option when the permission is for fields", () => {
      const permissionModel = buildDownloadPermission(
        { databaseId, schemaName: "schema", tableId: 1 },
        groupId,
        isNotAdmin,
        getPermissionGraph(),
        dataAccessPermissionValue,
        defaultGroup,
        "fields",
      );

      const expectedOptions = [
        DOWNLOAD_PERMISSION_OPTIONS.none,
        DOWNLOAD_PERMISSION_OPTIONS.limited,
        DOWNLOAD_PERMISSION_OPTIONS.full,
      ];

      expect(permissionModel.options).toStrictEqual(expectedOptions);
    });
  });

  describe("confirmations", () => {
    it("warns when group permissions is changing to more restrictive than the default group permission", () => {
      const permissionModel = buildDownloadPermission(
        { databaseId },
        groupId,
        isNotAdmin,
        getPermissionGraph(),
        dataAccessPermissionValue,
        defaultGroup,
        "schemas",
      );

      const [downgradePermissionConfirmation] =
        permissionModel.confirmations?.(DataPermissionValue.NONE) ?? [];

      expect(downgradePermissionConfirmation?.message).toBe(
        'The "All Users" group has a higher level of access than this, which will override this setting. You should limit or revoke the "All Users" group\'s access to this item.',
      );
    });

    it("warns when group permissions is already restrictive than the default group permission", () => {
      const permissionModel = buildDownloadPermission(
        { databaseId },
        groupId,
        isNotAdmin,
        getPermissionGraph("none"),
        dataAccessPermissionValue,
        defaultGroup,
        "schemas",
      );

      const [downgradePermissionConfirmation] =
        permissionModel.confirmations?.(DataPermissionValue.UNRESTRICTED) ?? [];

      expect(permissionModel.warning).toBe(
        'The "All Users" group has a higher level of access than this, which will override this setting. You should limit or revoke the "All Users" group\'s access to this item.',
      );
      expect(downgradePermissionConfirmation?.message).toBeUndefined();
    });
  });
});
