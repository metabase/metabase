import cx from "classnames";
import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  AIToolKey,
  type GroupInfo,
  type MetabotGroupPermission,
} from "metabase-types/api";

import S from "./AiFeatureAccessTable.module.css";
import { GroupPermissionRow } from "./GroupPermissionRow";
import { getAIToolItems } from "./utils";

export type AiFeatureAccessTableProps = {
  groups: GroupInfo[];
  groupPermissions: MetabotGroupPermission[];
  onPermissionChange: (
    groupId: number,
    toolKey: AIToolKey,
    value: "yes" | "no",
  ) => void;
};

export function AiFeatureAccessTable(props: AiFeatureAccessTableProps) {
  const { groups, groupPermissions, onPermissionChange } = props;
  const toolItems = getAIToolItems();
  const permissionsByGroup = useMemo(
    () => _.groupBy(groupPermissions, "group_id"),
    [groupPermissions],
  );

  return (
    <div className={S.CardContainer} data-testid="ai-feature-access-table">
      <table className={S.Table}>
        <thead>
          <tr>
            <th className={S.HeaderCell}>{t`Group`}</th>
            {toolItems.map(({ label, key }) => (
              <th
                key={key}
                className={cx(S.HeaderCell, S.CenterText, {
                  [S.AiFeatureCell]: key === AIToolKey.Metabot,
                })}
              >
                {label}
              </th>
            ))}
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
