import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import type { GroupInfo } from "metabase-types/api";

import S from "./AiAccessControlsTable.module.css";
import { GroupPermissionRow } from "./GroupPermissionRow";
import { getAIToolItems, useMetabotGroupPermissions } from "./utils";

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
