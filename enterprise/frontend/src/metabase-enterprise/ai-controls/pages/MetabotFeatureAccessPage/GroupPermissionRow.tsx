import cx from "classnames";
import { type ChangeEvent, useEffect, useState } from "react";
import { c, t } from "ttag";
import _, { type Dictionary } from "underscore";

import { Checkbox, Switch, Text } from "metabase/ui";
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
};

export function GroupPermissionRow(props: GroupPermissionRowProps) {
  const { onPermissionChange, initialPermissions, group } = props;
  const [permissionMap, setPermissionMap] =
    useState<Dictionary<MetabotGroupPermission>>();

  const isAdminGroup = group.magic_group_type === "admin";

  useEffect(() => {
    // Initialize permission map
    if (initialPermissions.length && !permissionMap) {
      setPermissionMap(_.indexBy(initialPermissions, "perm_type"));
    }
  }, [permissionMap, initialPermissions]);

  const isMetabotEnabled =
    isAdminGroup || permissionMap?.[AIToolKey.Metabot]?.perm_value === "yes";

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
        if (key === AIToolKey.Metabot) {
          return (
            <td key={key} className={cx(S.Cell, S.AiFeatureCell)}>
              <Switch
                aria-label={t`Allow ${group.name} user group to access AI features.`}
                size="sm"
                checked={isMetabotEnabled}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  handlePermissionChange(key, e.target.checked ? "yes" : "no")
                }
                classNames={{ body: S.InputBody }}
                disabled={isAdminGroup}
              />
            </td>
          );
        }

        return (
          <td key={key} className={S.Cell}>
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
              disabled={isAdminGroup || !isMetabotEnabled}
            />
          </td>
        );
      })}
    </tr>
  );
}
