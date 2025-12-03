import { createSelector } from "@reduxjs/toolkit";
import { getIn } from "icepick";
import { t } from "ttag";
import _ from "underscore";

import { UNABLE_TO_CHANGE_ADMIN_PERMISSIONS } from "metabase/admin/permissions/constants/messages";
import { getDefaultGroupHasHigherAccessText } from "metabase/admin/permissions/selectors/confirmations";
import {
  getAdminGroup,
  getOrderedGroups,
} from "metabase/admin/permissions/selectors/data-permissions/groups";
import { getGroupNameLocalized, isAdminGroup } from "metabase/lib/groups";
import { PLUGIN_APPLICATION_PERMISSIONS } from "metabase/plugins";
import type { Group } from "metabase-types/api";

import { APPLICATION_PERMISSIONS_OPTIONS } from "./constants";
import type {
  ApplicationPermissionKey,
  ApplicationPermissionValue,
  ApplicationPermissions,
  ApplicationPermissionsState,
} from "./types";

export function getPermissionWarning(
  value: ApplicationPermissionValue,
  defaultGroupValue: ApplicationPermissionValue,
  defaultGroup: Group,
) {
  if (defaultGroupValue === "yes" && value === "no") {
    return getDefaultGroupHasHigherAccessText(defaultGroup);
  }

  return null;
}

const getApplicationPermission = (
  permissions: ApplicationPermissions,
  groupId: number,
  permissionKey: ApplicationPermissionKey,
) => getIn(permissions, [groupId, permissionKey]) ?? "no";

export const getIsDirty = createSelector(
  (state: ApplicationPermissionsState) =>
    state.plugins.applicationPermissionsPlugin?.applicationPermissions,
  (state: ApplicationPermissionsState) =>
    state.plugins.applicationPermissionsPlugin?.originalApplicationPermissions,
  (permissions, originalPermissions) =>
    !_.isEqual(permissions, originalPermissions),
);

const getPermission = (
  permissions: ApplicationPermissions,
  isAdmin: boolean,
  groupId: number,
  defaultGroup: Group,
  permissionKey: string,
) => {
  const value = getApplicationPermission(
    permissions,
    groupId,
    permissionKey as ApplicationPermissionKey,
  );
  const defaultGroupValue = getApplicationPermission(
    permissions,
    defaultGroup.id,
    permissionKey as ApplicationPermissionKey,
  );

  const warning = getPermissionWarning(value, defaultGroupValue, defaultGroup);

  return {
    permission: permissionKey,
    isDisabled: isAdmin,
    warning,
    disabledTooltip: isAdmin ? UNABLE_TO_CHANGE_ADMIN_PERMISSIONS : null,
    value: getApplicationPermission(
      permissions,
      groupId,
      permissionKey as ApplicationPermissionKey,
    ),
    options: [
      APPLICATION_PERMISSIONS_OPTIONS.yes,
      APPLICATION_PERMISSIONS_OPTIONS.no,
    ],
  };
};

export const getApplicationPermissionEditor = createSelector(
  (state: ApplicationPermissionsState) =>
    state.plugins.applicationPermissionsPlugin?.applicationPermissions,
  getOrderedGroups,
  getAdminGroup,
  (permissions, groups: Group[][], defaultGroup?: Group) => {
    if (!permissions || groups == null || !defaultGroup) {
      return null;
    }

    const registeredPermissions = PLUGIN_APPLICATION_PERMISSIONS.permissions;

    if (registeredPermissions.length === 0) {
      return null;
    }

    const entities = groups.flat().map((group) => {
      const isAdmin = isAdminGroup(group);

      const groupPermissions = registeredPermissions.map((permDef) =>
        getPermission(
          permissions,
          isAdmin,
          group.id,
          defaultGroup,
          permDef.key,
        ),
      );

      return {
        id: group.id,
        name: getGroupNameLocalized(group),
        permissions: groupPermissions,
      };
    });

    const columns = [
      { name: t`Group name` },
      ...registeredPermissions.map((permDef) => ({
        name: permDef.columnName,
        ...(permDef.columnHint && { hint: permDef.columnHint }),
      })),
    ];

    return {
      filterPlaceholder: t`Search for a group`,
      columns,
      entities,
    };
  },
);
