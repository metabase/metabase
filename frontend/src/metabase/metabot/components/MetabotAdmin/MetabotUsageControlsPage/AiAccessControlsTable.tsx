import type { ChangeEvent } from "react";
import { c, t } from "ttag";

import { Checkbox, Select, Text } from "metabase/ui";
import type { GroupInfo } from "metabase-types/api";

import S from "./AiAccessControlsTable.module.css";
import {
  getAIToolItems,
  useGroupToolsAccessMap,
  useModelOptions,
} from "./utils";

export type AiAccessControlsTableProps = {
  groups: GroupInfo[];
};

export function AiAccessControlsTable(props: AiAccessControlsTableProps) {
  const { groups } = props;
  const modelOptions = useModelOptions();
  const toolItems = getAIToolItems();
  const { groupToolsAccessMap, onToolAccessChange } =
    useGroupToolsAccessMap(groups);

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
          {groups.map((group) => {
            const groupPerms = groupToolsAccessMap[group.id];
            return (
              <tr
                aria-label={c("{0} is the user group name")
                  .t`${group.name} permissions`}
                className={S.Row}
                key={group.id}
              >
                <td className={S.Cell}>
                  <Text>{group.name}</Text>
                </td>
                {toolItems.map(({ key, label }) => (
                  <td key={key} className={S.Cell}>
                    <Checkbox
                      aria-label={t`Allow ${group.name} user group to access ${label} AI tool.`}
                      size="sm"
                      checked={groupPerms[key] ?? false}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        onToolAccessChange(
                          group.id,
                          key,
                          e.currentTarget.checked,
                        )
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
          })}
        </tbody>
      </table>
    </div>
  );
}
