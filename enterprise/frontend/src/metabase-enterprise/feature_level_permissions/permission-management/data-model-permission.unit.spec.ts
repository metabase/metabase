import { DataPermissionValue } from "metabase/admin/permissions/types";
import type { Group, GroupsPermissions } from "metabase-types/api";

import {
  buildDataModelPermission,
  DATA_MODEL_PERMISSION_OPTIONS,
} from "./data-model-permission";

const defaultGroupId = 1;
const groupId = 2;

const databaseId = 1;

const getPermissionGraph = (value = "all"): GroupsPermissions =>
  ({
    [defaultGroupId]: {
      [databaseId]: {
        "data-model": {
          schemas: "all",
        },
      },
    },
    [groupId]: {
      [databaseId]: {
        "data-model": {
          schemas: value,
        },
      },
    },
  } as any);

const isAdmin = true;
const isNotAdmin = false;

const defaultGroup: Group = {
  id: defaultGroupId,
  name: "All Users",
} as Group;

describe("buildDataModelPermission", () => {
  it("sets correct permission and type fields and value", () => {
    const permissionModel = buildDataModelPermission(
      { databaseId },
      groupId,
      isNotAdmin,
      getPermissionGraph(),
      defaultGroup,
      "schemas",
    );

    expect(permissionModel.value).toBe("all");
    expect(permissionModel.type).toBe("data-model");
    expect(permissionModel.permission).toBe("data-model");
  });

  it("disables permission editing for admins", () => {
    const permissionModel = buildDataModelPermission(
      { databaseId },
      groupId,
      isAdmin,
      getPermissionGraph(),
      defaultGroup,
      "schemas",
    );

    expect(permissionModel.isDisabled).toBe(true);
    expect(permissionModel.disabledTooltip).toBe(
      "Administrators always have the highest level of access to everything in Metabase.",
    );
  });

  it("does not disable permission editing for non-admins", () => {
    const permissionModel = buildDataModelPermission(
      { databaseId },
      groupId,
      isNotAdmin,
      getPermissionGraph(),
      defaultGroup,
      "schemas",
    );

    expect(permissionModel.isDisabled).toBe(false);
    expect(permissionModel.disabledTooltip).toBe(null);
  });

  describe("permission options", () => {
    it("include controlled option when the permission is for schemas or tables", () => {
      const schemasPermissionModel = buildDataModelPermission(
        { databaseId },
        groupId,
        isNotAdmin,
        getPermissionGraph(),
        defaultGroup,
        "schemas",
      );

      const tablesPermissionModel = buildDataModelPermission(
        { databaseId, schemaName: "schema" },
        groupId,
        isNotAdmin,
        getPermissionGraph(),
        defaultGroup,
        "tables",
      );

      const expectedOptions = [
        DATA_MODEL_PERMISSION_OPTIONS.none,
        DATA_MODEL_PERMISSION_OPTIONS.controlled,
        DATA_MODEL_PERMISSION_OPTIONS.edit,
      ];

      expect(schemasPermissionModel.options).toStrictEqual(expectedOptions);
      expect(tablesPermissionModel.options).toStrictEqual(expectedOptions);
    });

    it("does not include controlled option when the permission is for fields", () => {
      const permissionModel = buildDataModelPermission(
        { databaseId, schemaName: "schema", tableId: 1 },
        groupId,
        isNotAdmin,
        getPermissionGraph(),
        defaultGroup,
        "fields",
      );

      const expectedOptions = [
        DATA_MODEL_PERMISSION_OPTIONS.none,
        DATA_MODEL_PERMISSION_OPTIONS.edit,
      ];

      expect(permissionModel.options).toStrictEqual(expectedOptions);
    });
  });

  describe("confirmations", () => {
    it("warns when group permissions is changing to more restrictive than the default group permission", () => {
      const permissionModel = buildDataModelPermission(
        { databaseId },
        groupId,
        isNotAdmin,
        getPermissionGraph(),
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
      const permissionModel = buildDataModelPermission(
        { databaseId },
        groupId,
        isNotAdmin,
        getPermissionGraph("none"),
        defaultGroup,
        "schemas",
      );

      const [downgradePermissionConfirmation] =
        permissionModel.confirmations?.(DataPermissionValue.ALL) ?? [];

      expect(permissionModel.warning).toBe(
        'The "All Users" group has a higher level of access than this, which will override this setting. You should limit or revoke the "All Users" group\'s access to this item.',
      );
      expect(downgradePermissionConfirmation?.message).toBeUndefined();
    });

    it("does not warn when group permissions is blocking", () => {
      const permissionModel = buildDataModelPermission(
        { databaseId },
        groupId,
        isNotAdmin,
        getPermissionGraph("block"),
        defaultGroup,
        "schemas",
      );

      permissionModel.confirmations?.(DataPermissionValue.ALL);

      expect(permissionModel.warning).toBe(null);
    });
  });
});
