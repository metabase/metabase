import { type ChangeEvent, useMemo } from "react";
import { c, t } from "ttag";
import _ from "underscore";

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
  groupPermissions: MetabotGroupPermission[];
  onPermissionChange: (
    groupId: number,
    toolKey: AIToolKey,
    value: "yes" | "no",
  ) => void;
};

export function GroupPermissionRow(props: GroupPermissionRowProps) {
  const { onPermissionChange, groupPermissions, group } = props;

  const isAdminGroup = group.magic_group_type === "admin";

  const permissionMap = useMemo(() => {
    return _.indexBy(groupPermissions, "perm_type");
  }, [groupPermissions]);

  const isMetabotEnabled =
    isAdminGroup || permissionMap[AIToolKey.Metabot]?.perm_value === "yes";

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
            <td key={key} className={`${S.Cell} ${S.AiFeatureCell}`}>
              <Switch
                aria-label={t`Allow ${group.name} user group to access AI features.`}
                size="sm"
                checked={isMetabotEnabled}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  onPermissionChange(
                    group.id,
                    key,
                    e.target.checked ? "yes" : "no",
                  )
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
              checked={isAdminGroup || permissionMap[key]?.perm_value === "yes"}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                onPermissionChange(
                  group.id,
                  key,
                  e.target.checked ? "yes" : "no",
                )
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
