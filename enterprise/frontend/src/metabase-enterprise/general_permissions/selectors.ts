import _ from "underscore";
import { State } from "metabase-types/store";
import { createSelector } from "reselect";
import Groups from "metabase/entities/groups";
import { Group } from "metabase-types/api";
import { isAdminGroup } from "metabase/lib/groups";
import { t } from "ttag";
import { UNABLE_TO_CHANGE_ADMIN_PERMISSIONS } from "metabase/admin/permissions/constants/messages";
import { GENERAL_PERMISSIONS_OPTIONS } from "./constants";

export const getIsDirty = createSelector(
  (state: State) => state.admin.permissions.generalPermissions,
  state => state.admin.permissions.originalGeneralPermissions,
  (permissions, originalPermissions) =>
    !_.isEqual(permissions, originalPermissions),
);

export const getGeneralPermissionEditor = createSelector(
  (state: State) => state.admin.permissions.generalPermissions,
  Groups.selectors.getList,
  (permissions, groups: Group[]) => {
    if (!permissions || groups == null) {
      return null;
    }

    const entities = groups.map(group => {
      const isAdmin = isAdminGroup(group);

      return {
        id: group.id,
        name: group.name,
        permissions: [
          {
            permission: "general_settings",
            isDisabled: isAdmin,
            disabledTooltip: isAdmin
              ? UNABLE_TO_CHANGE_ADMIN_PERMISSIONS
              : null,
            value: permissions[group.id]["general_settings"],
            options: [
              GENERAL_PERMISSIONS_OPTIONS.yes,
              GENERAL_PERMISSIONS_OPTIONS.no,
            ],
          },
          {
            permission: "subscriptions_alerts",
            isDisabled: isAdmin,
            disabledTooltip: isAdmin
              ? UNABLE_TO_CHANGE_ADMIN_PERMISSIONS
              : null,
            value: permissions[group.id]["subscriptions_alerts"],
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
        {
          name: t`Monitoring access`,
          hint: t`This grants access to Tools, Audit and Troubleshooting`,
        },
        { name: `Subscriptions and Alerts` },
      ],
      entities,
    };
  },
);
