import { t } from "ttag";
import _ from "underscore";

import {
  getGroupNameLocalized,
  isAdminGroup,
  isDefaultGroup,
} from "metabase/common/utils/groups";
import {
  Messages,
  type PermissionEditorType,
  type PermissionSectionBase,
  getDefaultGroupHasHigherAccessText,
  getOrderedGroups,
} from "metabase/permissions";
import { PLUGIN_TENANTS } from "metabase/plugins";
import {
  type ApplicationPermissionKey,
  type ApplicationPermissionValue,
  type ApplicationPermissions,
  DataPermissionValue,
  type GroupInfo,
} from "metabase-types/api";

import { APPLICATION_PERMISSIONS_OPTIONS } from "../../constants";

export type ApplicationPermissionSection = PermissionSectionBase & {
  permission: ApplicationPermissionKey;
};

export const toApplicationPermissionValue = (
  value: DataPermissionValue,
): ApplicationPermissionValue =>
  value === DataPermissionValue.YES ? "yes" : "no";

const getApplicationPermission = (
  permissions: ApplicationPermissions,
  groupId: number,
  permission: ApplicationPermissionKey,
): ApplicationPermissionValue => permissions[groupId]?.[permission] ?? "no";

const getPermissionWarning = (
  value: ApplicationPermissionValue,
  defaultGroupValue: ApplicationPermissionValue,
  defaultGroup: GroupInfo,
) =>
  defaultGroupValue === "yes" && value === "no"
    ? getDefaultGroupHasHigherAccessText(defaultGroup)
    : null;

type ApplicationPermissionSectionOpts = {
  permissions: ApplicationPermissions;
  isAdmin: boolean;
  groupId: number;
  defaultGroup: GroupInfo;
  permission: ApplicationPermissionKey;
  isDisabled: boolean;
  tooltip?: string | null;
};

const getApplicationPermissionSection = ({
  permissions,
  isAdmin,
  groupId,
  defaultGroup,
  permission,
  isDisabled,
  tooltip = null,
}: ApplicationPermissionSectionOpts): ApplicationPermissionSection => {
  const value = getApplicationPermission(permissions, groupId, permission);
  const defaultGroupValue = getApplicationPermission(
    permissions,
    defaultGroup.id,
    permission,
  );

  return {
    permission,
    isDisabled,
    warning: getPermissionWarning(value, defaultGroupValue, defaultGroup),
    disabledTooltip: isAdmin
      ? Messages.UNABLE_TO_CHANGE_ADMIN_PERMISSIONS
      : tooltip,
    value: value === "yes" ? DataPermissionValue.YES : DataPermissionValue.NO,
    options: [
      APPLICATION_PERMISSIONS_OPTIONS.yes,
      APPLICATION_PERMISSIONS_OPTIONS.no,
    ],
  };
};

export const getApplicationPermissionEditor = (
  permissions: ApplicationPermissions,
  groups: GroupInfo[],
): PermissionEditorType<ApplicationPermissionSection> | null => {
  const defaultGroup = groups.find(isDefaultGroup);
  if (!defaultGroup) {
    return null;
  }

  const allGroups = getOrderedGroups(groups).flat();
  const externalUsersGroup = _.find(
    allGroups,
    PLUGIN_TENANTS.isExternalUsersGroup,
  );

  const entities = allGroups.map((group) => {
    const isAdmin = isAdminGroup(group);
    const isExternal =
      !!externalUsersGroup && PLUGIN_TENANTS.isTenantGroup(group);
    const sectionDefaultGroup =
      isExternal && externalUsersGroup ? externalUsersGroup : defaultGroup;

    return {
      id: group.id,
      name: getGroupNameLocalized(group),
      icon: isExternal ? <PLUGIN_TENANTS.TenantGroupHintIcon /> : undefined,
      permissions: [
        getApplicationPermissionSection({
          permissions,
          isAdmin,
          groupId: group.id,
          defaultGroup: sectionDefaultGroup,
          permission: "setting",
          isDisabled: isAdmin || isExternal,
          tooltip: isExternal
            ? Messages.EXTERNAL_USERS_NO_ACCESS_SETTINGS
            : null,
        }),
        getApplicationPermissionSection({
          permissions,
          isAdmin,
          groupId: group.id,
          defaultGroup: sectionDefaultGroup,
          permission: "monitoring",
          isDisabled: isAdmin || isExternal,
          tooltip: isExternal
            ? Messages.EXTERNAL_USERS_NO_ACCESS_MONITORING
            : null,
        }),
        getApplicationPermissionSection({
          permissions,
          isAdmin,
          groupId: group.id,
          defaultGroup: sectionDefaultGroup,
          permission: "subscription",
          isDisabled: isAdmin,
        }),
      ],
    };
  });

  return {
    title: "",
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
};
