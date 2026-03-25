import { type ChangeEvent, useMemo } from "react";
import { c, t } from "ttag";
import _ from "underscore";

import { Checkbox, Select, Text } from "metabase/ui";
import type { GroupInfo, MetabotGroupPermission } from "metabase-types/api";

import S from "./AiAccessControlsTable.module.css";
import {
  type AIToolKey,
  getAIToolItems,
  getModelOptions,
  useMetabotGroupPermissions,
} from "./utils";

export type AiAccessControlsTableProps = {
  groups: GroupInfo[];
};

export function AiAccessControlsTable(props: AiAccessControlsTableProps) {
  const { groups } = props;
  const toolItems = getAIToolItems();
  const { groupPermissions, onPermissionChange } = useMetabotGroupPermissions();
  const permissionsByGroup = useMemo(
    () => _.groupBy(groupPermissions, "group_id"),
    [groupPermissions],
  );

  return (
    <div className={S.CardContainer} data-testid="ai-access-controls-table">
      <table className={S.Table}>
        <thead>
          <tr>
            <th className={S.HeaderCell}>{t`Group`}</th>
            {toolItems.map(({ label, key }) => (
              <th key={key} className={S.HeaderCell}>
                {label}
              </th>
            ))}
            <th className={S.HeaderCell}>{t`Model`}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <GroupPermissionRow
              group={group}
              groupPermissions={permissionsByGroup[group.id] || []}
              key={group.id}
              onPermissionChange={onPermissionChange}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

type GroupPermissionRowProps = {
  group: GroupInfo;
  groupPermissions: MetabotGroupPermission[];
  onPermissionChange: (
    groupId: number,
    toolKey: AIToolKey,
    enabled: boolean,
  ) => void;
};

function GroupPermissionRow(props: GroupPermissionRowProps) {
  const { onPermissionChange, groupPermissions, group } = props;
  const modelOptions = getModelOptions();

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
              onPermissionChange(group.id, key, e.target.checked)
            }
            classNames={{
              body: S.inputBody,
            }}
          />
        </td>
      ))}
      <td className={S.Cell}>
        <Select
          aria-label={group.name}
          className={S.ModelSelect}
          data={modelOptions}
          defaultValue="default"
          miw="10rem"
          size="sm"
        />
      </td>
    </tr>
  );
}
