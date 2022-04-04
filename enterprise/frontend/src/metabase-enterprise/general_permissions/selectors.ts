import _ from "underscore";
import { t } from "ttag";
import { createSelector } from "reselect";
import { Group } from "metabase-types/api";
import { isAdminGroup } from "metabase/lib/groups";
import { UNABLE_TO_CHANGE_ADMIN_PERMISSIONS } from "metabase/admin/permissions/constants/messages";
import { getOrderedGroups } from "metabase/admin/permissions/selectors/data-permissions/groups";
import { GENERAL_PERMISSIONS_OPTIONS } from "./constants";
import { getIn } from "icepick";
import { GeneralPermissionsState } from "./types/state";

export const canManageSubscriptions = (state: GeneralPermissionsState) =>
  state.currentUser.permissions.can_access_subscription;

export const getIsDirty = createSelector(
  (state: GeneralPermissionsState) =>
    state.plugins.generalPermissionsPlugin?.generalPermissions,
  state => state.plugins.generalPermissionsPlugin?.originalGeneralPermissions,
  (permissions, originalPermissions) =>
    !_.isEqual(permissions, originalPermissions),
);

export const getGeneralPermissionEditor = createSelector(
  (state: GeneralPermissionsState) =>
    state.plugins.generalPermissionsPlugin?.generalPermissions,
  getOrderedGroups,
  (permissions, groups: Group[][]) => {
    if (!permissions || groups == null) {
      return null;
    }

    const entities = groups.flat().map(group => {
      const isAdmin = isAdminGroup(group);

      const subscriptionValue =
        getIn(permissions, [group.id, "subscription"]) ?? "no";

      return {
        id: group.id,
        name: group.name,
        permissions: [
          {
            permission: "subscription",
            isDisabled: isAdmin,
            disabledTooltip: isAdmin
              ? UNABLE_TO_CHANGE_ADMIN_PERMISSIONS
              : null,
            value: subscriptionValue,
            options: [
              GENERAL_PERMISSIONS_OPTIONS.yes,
              GENERAL_PERMISSIONS_OPTIONS.no,
            ],
          },
        ],
      };
    });

    return {
      filterPlaceholder: t`Search for a group`,
      columns: [
        { name: `General settings access` },
        { name: `Subscriptions and Alerts` },
      ],
      entities,
    };
  },
);
