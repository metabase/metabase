import { createSelector } from "@reduxjs/toolkit";
import { getIn } from "icepick";
import { t } from "ttag";
import _ from "underscore";

import { Messages } from "metabase/admin/permissions/constants/messages";
import { getDefaultGroupHasHigherAccessText } from "metabase/admin/permissions/selectors/confirmations";
import {
  getDefaultGroup,
  getOrderedGroups,
} from "metabase/admin/permissions/selectors/data-permissions/groups";
import { getGroupNameLocalized, isAdminGroup } from "metabase/lib/groups";
import { PLUGIN_TENANTS } from "metabase/plugins";
import type { Group } from "metabase-types/api";

import { APPLICATION_PERMISSIONS_OPTIONS } from "./constants";
import type {
  ApplicationPermissionKey,
  ApplicationPermissionValue,
  ApplicationPermissions,
} from "./types/permissions";
import type { ApplicationPermissionsState } from "./types/state";

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

export const canManageSubscriptions = createSelector(
  (state: ApplicationPermissionsState) => state.currentUser,
  (user) => user?.permissions?.can_access_subscription ?? false,
);

export const canAccessSettings = createSelector(
  (state: ApplicationPermissionsState) => state.currentUser,
  (user) => user?.permissions?.can_access_setting ?? false,
);

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
  permissionKey: ApplicationPermissionKey,
  isDisabled: boolean,
  tooltip: string | null = null,
) => {
  const value = getApplicationPermission(permissions, groupId, permissionKey);
  const defaultGroupValue = getApplicationPermission(
    permissions,
    defaultGroup.id,
    permissionKey,
  );

  const warning = getPermissionWarning(value, defaultGroupValue, defaultGroup);

  return {
    permission: permissionKey,
    isDisabled,
    warning,
    disabledTooltip: isAdmin
      ? Messages.UNABLE_TO_CHANGE_ADMIN_PERMISSIONS
      : tooltip,
    value: getApplicationPermission(permissions, groupId, permissionKey),
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
  getDefaultGroup,
  (permissions, groups: Group[][], defaultGroup?: Group) => {
    if (!permissions || groups == null || !defaultGroup) {
      return null;
    }

    const allGroups = groups.flat();

    const externalUsersGroup = _.find(
      allGroups,
      PLUGIN_TENANTS.isExternalUsersGroup,
    );

    const entities = allGroups.map((group) => {
      const isAdmin = isAdminGroup(group);
      const isExternal =
        !!externalUsersGroup && PLUGIN_TENANTS.isTenantGroup(group);

      return {
        id: group.id,
        name: getGroupNameLocalized(group),
        icon: isExternal ? <PLUGIN_TENANTS.TenantGroupHintIcon /> : undefined,
        permissions: [
          getPermission(
            permissions,
            isAdmin,
            group.id,
            isExternal ? externalUsersGroup : defaultGroup,
            "setting",
            isAdmin || isExternal,
            isExternal ? Messages.EXTERNAL_USERS_NO_ACCESS_SETTINGS : null,
          ),
          getPermission(
            permissions,
            isAdmin,
            group.id,
            isExternal ? externalUsersGroup : defaultGroup,
            "monitoring",
            isAdmin || isExternal,
            isExternal ? Messages.EXTERNAL_USERS_NO_ACCESS_MONITORING : null,
          ),
          getPermission(
            permissions,
            isAdmin,
            group.id,
            isExternal ? externalUsersGroup : defaultGroup,
            "subscription",
            isAdmin,
          ),
        ],
      };
    });

    return {
      filterPlaceholder: t`Search for a group`,
      columns: [
        { name: t`Group name` },
        { name: t`Settings access` },
        {
          name: t`Monitoring access`,
          hint: t`This grants access to Tools`,
        },
        { name: t`Subscriptions and Alerts` },
      ],
      entities,
    };
  },
);
