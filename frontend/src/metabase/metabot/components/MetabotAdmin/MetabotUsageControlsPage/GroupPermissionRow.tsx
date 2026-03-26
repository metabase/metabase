import { type ChangeEvent, useMemo } from "react";
import { c, t } from "ttag";
import _ from "underscore";

import { Checkbox, Select, Text } from "metabase/ui";
import {
  AIToolKey,
  type GroupInfo,
  type MetabotGroupPermission,
  type MetabotModelSize,
} from "metabase-types/api";

import S from "./AiAccessControlsTable.module.css";
import { getAIToolItems, getModelOptions } from "./utils";

type GroupPermissionRowProps = {
  group: GroupInfo;
  groupPermissions: MetabotGroupPermission[];
  onPermissionChange: (
    groupId: number,
    toolKey: AIToolKey,
    value: "yes" | "no" | MetabotModelSize,
  ) => void;
};

export function GroupPermissionRow(props: GroupPermissionRowProps) {
  const { onPermissionChange, groupPermissions, group } = props;

  const permissionMap = useMemo(() => {
    return _.indexBy(groupPermissions, "perm_type");
  }, [groupPermissions]);

  return (
    <tr
      aria-label={c("{0} is the user group name").t`${group.name} permissions`}
      className={S.Row}
      key={group.id}
    >
      <td className={S.Cell}>
        <Text>{group.name}</Text>
      </td>
      {getAIToolItems().map(({ key, label }) => (
        <td key={key} className={S.Cell}>
          <Checkbox
            aria-label={t`Allow ${group.name} user group to access ${label} AI tool.`}
            size="sm"
            checked={permissionMap[key]?.perm_value === "yes"}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              onPermissionChange(group.id, key, e.target.checked ? "yes" : "no")
            }
            classNames={{ body: S.inputBody }}
            disabled={
              permissionMap[AIToolKey.Metabot]?.perm_value === "no" &&
              key !== AIToolKey.Metabot
            }
          />
        </td>
      ))}
      <td className={S.Cell}>
        <Select
          aria-label={group.name}
          className={S.ModelSelect}
          data={getModelOptions()}
          defaultValue="default"
          disabled={permissionMap[AIToolKey.Metabot]?.perm_value === "no"}
          miw="10rem"
          size="sm"
          value={permissionMap[AIToolKey.Model]?.perm_value}
          onChange={(value) =>
            onPermissionChange(group.id, AIToolKey.Model, value)
          }
        />
      </td>
    </tr>
  );
}
