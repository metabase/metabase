import { DataPermissionValue } from "metabase/admin/permissions/types";
import type { Group, GroupsPermissions } from "metabase-types/api";

import {
  buildDetailsPermission,
  DETAILS_PERMISSION_OPTIONS,
} from "./details-permission";

const defaultGroupId = 1;
const groupId = 2;

const databaseId = 1;

const getPermissionGraph = (value = "yes"): GroupsPermissions =>
  ({
    [defaultGroupId]: {
      [databaseId]: {
        details: "yes",
      },
    },
    [groupId]: {
      [databaseId]: {
        details: value,
      },
    },
  } as any);

const isAdmin = true;
const isNotAdmin = false;

const defaultGroup: Group = {
  id: defaultGroupId,
  name: "All Users",
} as Group;

describe("buildDetailsPermission", () => {
  it("returns null for table and field levels", () => {
    const fieldsPermissionModel = buildDetailsPermission(
      { databaseId },
      groupId,
      isNotAdmin,
      getPermissionGraph(),
      defaultGroup,
      "fields",
    );

    const tablesPermissionModel = buildDetailsPermission(
      { databaseId },
      groupId,
      isNotAdmin,
      getPermissionGraph(),
      defaultGroup,
      "tables",
    );

    expect(fieldsPermissionModel).toBeNull();
    expect(tablesPermissionModel).toBeNull();
  });

  it("disables permission editing for admins", () => {
    const permissionModel = buildDetailsPermission(
      { databaseId },
      groupId,
      isAdmin,
      getPermissionGraph(),
      defaultGroup,
      "schemas",
    );

    expect(permissionModel?.isDisabled).toBe(true);
    expect(permissionModel?.disabledTooltip).toBe(
      "Administrators always have the highest level of access to everything in Metabase.",
    );
  });

  it("does not disable permission editing for non-admins", () => {
    const permissionModel = buildDetailsPermission(
      { databaseId },
      groupId,
      isNotAdmin,
      getPermissionGraph(),
      defaultGroup,
      "schemas",
    );

    expect(permissionModel?.isDisabled).toBe(false);
    expect(permissionModel?.disabledTooltip).toBe(null);
  });

  it("permission options include controlled option when the permission is for schemas or tables", () => {
    const permissionModel = buildDetailsPermission(
      { databaseId },
      groupId,
      isNotAdmin,
      getPermissionGraph(),
      defaultGroup,
      "schemas",
    );

    expect(permissionModel?.options).toStrictEqual([
      DETAILS_PERMISSION_OPTIONS.no,
      DETAILS_PERMISSION_OPTIONS.yes,
    ]);
  });

  describe("confirmations", () => {
    it("warns when group permissions is changing to more restrictive than the default group permission", () => {
      const permissionModel = buildDetailsPermission(
        { databaseId },
        groupId,
        isNotAdmin,
        getPermissionGraph(),
        defaultGroup,
        "schemas",
      );

      const [downgradePermissionConfirmation] =
        permissionModel?.confirmations?.(DataPermissionValue.NO) || [];

      expect(downgradePermissionConfirmation?.message).toBe(
        'The "All Users" group has a higher level of access than this, which will override this setting. You should limit or revoke the "All Users" group\'s access to this item.',
      );
    });

    it("warns when group permissions is already restrictive than the default group permission", () => {
      const permissionModel = buildDetailsPermission(
        { databaseId },
        groupId,
        isNotAdmin,
        getPermissionGraph("no"),
        defaultGroup,
        "schemas",
      );

      const [downgradePermissionConfirmation] =
        permissionModel?.confirmations?.(DataPermissionValue.YES) ?? [];

      expect(permissionModel?.warning).toBe(
        'The "All Users" group has a higher level of access than this, which will override this setting. You should limit or revoke the "All Users" group\'s access to this item.',
      );
      expect(downgradePermissionConfirmation?.message).toBeUndefined();
    });
  });
});
