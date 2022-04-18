import _ from "underscore";
import { t } from "ttag";
import { createSelector } from "reselect";
import { Group } from "metabase-types/api";
import { isAdminGroup } from "metabase/lib/groups";
import { UNABLE_TO_CHANGE_ADMIN_PERMISSIONS } from "metabase/admin/permissions/constants/messages";
import { getOrderedGroups } from "metabase/admin/permissions/selectors/data-permissions/groups";
import { APPLICATION_PERMISSIONS_OPTIONS } from "./constants";
import { getIn } from "icepick";
import { ApplicationPermissionsState } from "./types/state";
import {
  ApplicationPermissionKey,
  ApplicationPermissions,
} from "./types/permissions";

export const canManageSubscriptions = (state: ApplicationPermissionsState) =>
  state.currentUser.permissions?.can_access_subscription ?? false;

const getApplicationPermission = (
  permissions: ApplicationPermissions,
  groupId: number,
  permissionKey: ApplicationPermissionKey,
) => getIn(permissions, [groupId, permissionKey]) ?? "no";

export const getIsDirty = createSelector(
  (state: ApplicationPermissionsState) =>
    state.plugins.applicationPermissionsPlugin?.applicationPermissions,
  state =>
    state.plugins.applicationPermissionsPlugin?.originalApplicationPermissions,
  (permissions, originalPermissions) =>
    !_.isEqual(permissions, originalPermissions),
);

const getPermission = (
  permissions: ApplicationPermissions,
  isAdmin: boolean,
  groupId: number,
  permissionKey: ApplicationPermissionKey,
) => ({
  permission: permissionKey,
  isDisabled: isAdmin,
  disabledTooltip: isAdmin ? UNABLE_TO_CHANGE_ADMIN_PERMISSIONS : null,
  value: getApplicationPermission(permissions, groupId, permissionKey),
  options: [
    APPLICATION_PERMISSIONS_OPTIONS.yes,
    APPLICATION_PERMISSIONS_OPTIONS.no,
  ],
});

export const getApplicationPermissionEditor = createSelector(
  (state: ApplicationPermissionsState) =>
    state.plugins.applicationPermissionsPlugin?.applicationPermissions,
  getOrderedGroups,
  (permissions, groups: Group[][]) => {
    if (!permissions || groups == null) {
      return null;
    }

    const entities = groups.flat().map(group => {
      const isAdmin = isAdminGroup(group);

      return {
        id: group.id,
        name: group.name,
        permissions: [
          getPermission(permissions, isAdmin, group.id, "setting"),
          getPermission(permissions, isAdmin, group.id, "monitoring"),
          getPermission(permissions, isAdmin, group.id, "subscription"),
        ],
      };
    });

    return {
      filterPlaceholder: t`Search for a group`,
      columns: [
        { name: t`Group name` },
        { name: t`Settings access` },
        {
          name: `Monitoring access`,
          hint: t`This grants access to Tools, Audit, and Troubleshooting`,
        },
        { name: t`Subscriptions and Alerts` },
      ],
      entities,
    };
  },
);
