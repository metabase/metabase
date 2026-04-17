import cx from "classnames";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { c, t } from "ttag";
import _, { type Dictionary } from "underscore";

import { Box, Checkbox, Switch, Text } from "metabase/ui";
import { isDefaultGroup } from "metabase/utils/groups";
import { AllUsersHigherAccessTooltipIcon } from "metabase-enterprise/ai-controls/components/AllUsersHigherAccessTooltipIcon";
import {
  AIToolKey,
  type GroupInfo,
  type MetabotGroupPermission,
} from "metabase-types/api";

import S from "./GroupPermissionRow.module.css";
import { getAIToolItems } from "./utils";

type GroupPermissionRowProps = {
  group: GroupInfo;
  initialPermissions: MetabotGroupPermission[];
  onPermissionChange: (
    groupId: number,
    toolKey: AIToolKey,
    value: "yes" | "no",
  ) => void;
  allUsersGroup?: GroupInfo;
  allUsersGroupPermissions?: MetabotGroupPermission[];
};

export function GroupPermissionRow(props: GroupPermissionRowProps) {
  const {
    onPermissionChange,
    initialPermissions,
    group,
    allUsersGroup,
    allUsersGroupPermissions,
  } = props;
  const [permissionMap, setPermissionMap] =
    useState<Dictionary<MetabotGroupPermission>>();

  const isAdminGroup = group.magic_group_type === "admin";
  const isAllUsersGroup =
    isDefaultGroup(group) || group.magic_group_type === "all-external-users";

  useEffect(() => {
    // Initialize permission map
    if (initialPermissions.length && !permissionMap) {
      setPermissionMap(_.indexBy(initialPermissions, "perm_type"));
    }
  }, [permissionMap, initialPermissions]);

  const allUsersGroupPermissionsMap = useMemo(
    () =>
      allUsersGroupPermissions
        ? _.indexBy(allUsersGroupPermissions, "perm_type")
        : {},
    [allUsersGroupPermissions],
  );

  const isMetabotEnabledForThisGroup =
    isAdminGroup || permissionMap?.[AIToolKey.Metabot]?.perm_value === "yes";

  const isAllUsersGroupOverriding = (toolKey: AIToolKey): boolean => {
    if (!allUsersGroup || isAdminGroup || isAllUsersGroup) {
      return false;
    }

    const isMetabotEnabledForAllUsers =
      allUsersGroupPermissionsMap[AIToolKey.Metabot]?.perm_value === "yes";

    if (!isMetabotEnabledForAllUsers) {
      return false;
    }

    const allUsersValue = allUsersGroupPermissionsMap[toolKey]?.perm_value;
    const thisGroupValue = permissionMap?.[toolKey]?.perm_value;

    return allUsersValue === "yes" && thisGroupValue === "no";
  };

  const handlePermissionChange = (key: AIToolKey, value: "yes" | "no") => {
    setPermissionMap((prev) => ({
      ...prev,
      [key]: {
        perm_value: value,
        group_id: group.id,
        perm_type: key,
      },
    }));
    onPermissionChange(group.id, key, value);
  };

  return (
    <tr
      aria-label={c("{0} is the user group name").t`${group.name} permissions`}
      className={S.Row}
      key={group.id}
    >
      <td className={S.Cell}>
        <Text>{group.name}</Text>
      </td>
      {getAIToolItems().map(({ key, label }) => {
        const showAllUsersOverrideTooltip =
          isAllUsersGroupOverriding(key) && !!allUsersGroup;

        if (key === AIToolKey.Metabot) {
          return (
            <td key={key} className={cx(S.Cell, S.AiFeatureCell)}>
              <Box className={S.CellContent}>
                <Switch
                  aria-label={t`Allow ${group.name} user group to access AI features.`}
                  size="sm"
                  checked={isMetabotEnabledForThisGroup}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    handlePermissionChange(key, e.target.checked ? "yes" : "no")
                  }
                  classNames={{ body: S.InputBody }}
                  disabled={isAdminGroup}
                />
                {showAllUsersOverrideTooltip && (
                  <AllUsersHigherAccessTooltipIcon
                    groupName={allUsersGroup.name}
                    variant="tool-permission"
                  />
                )}
              </Box>
            </td>
          );
        }

        return (
          <td key={key} className={S.Cell}>
            <Box className={S.CellContent}>
              <Checkbox
                aria-label={t`Allow ${group.name} user group to access ${label} AI tool.`}
                size="md"
                checked={
                  isAdminGroup || permissionMap?.[key]?.perm_value === "yes"
                }
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  handlePermissionChange(key, e.target.checked ? "yes" : "no")
                }
                classNames={{ body: S.InputBody }}
                disabled={isAdminGroup || !isMetabotEnabledForThisGroup}
              />
              {showAllUsersOverrideTooltip && (
                <AllUsersHigherAccessTooltipIcon
                  groupName={allUsersGroup.name}
                  variant="tool-permission"
                />
              )}
            </Box>
          </td>
        );
      })}
    </tr>
  );
}
