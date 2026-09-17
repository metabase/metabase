import cx from "classnames";
import type { ReactNode } from "react";
import { t } from "ttag";

import { getGroupNameLocalized } from "metabase/common/utils/groups";
import { Ellipsified } from "metabase/ui";
import type { McpGroupPermission, McpTool } from "metabase-types/api";

import { GroupHeaderMenu } from "./GroupHeaderMenu";
import S from "./McpToolsGrid.module.css";
import { McpToolsGridRow } from "./McpToolsGridRow";
import {
  GROUP_COLUMN_WIDTH_PX,
  SWITCH_COLUMN_MIN_WIDTH_PX,
  TOOL_COLUMN_WIDTH_PX,
} from "./constants";
import type { McpToolsGridRow as GridRow, McpToolsGridColumn } from "./types";
import { useGroupColumnVirtualizer } from "./use-group-column-virtualizer";

type McpToolsGridProps = {
  rows: GridRow[];
  columns: McpToolsGridColumn[];
  allTools: McpTool[];
  headerTrailing?: ReactNode;
  onPermissionChange: (permission: McpGroupPermission) => void;
};

export function McpToolsGrid({
  rows,
  columns,
  allTools,
  headerTrailing,
  onPermissionChange,
}: McpToolsGridProps) {
  const {
    scrollRef,
    virtualColumns,
    leadingSpacerWidth,
    trailingSpacerWidth,
    tableMinWidth,
  } = useGroupColumnVirtualizer(columns.length);
  const tableWidth = headerTrailing
    ? tableMinWidth + SWITCH_COLUMN_MIN_WIDTH_PX
    : tableMinWidth;

  return (
    <div ref={scrollRef} className={S.scroller}>
      <table
        className={S.table}
        style={{ width: tableWidth }}
        aria-label={t`MCP tools access`}
      >
        <colgroup>
          <col style={{ width: TOOL_COLUMN_WIDTH_PX }} />
          <col style={{ width: leadingSpacerWidth }} />
          {virtualColumns.map((virtualColumn) => (
            <col
              key={columns[virtualColumn.index].group.id}
              style={{ width: GROUP_COLUMN_WIDTH_PX }}
            />
          ))}
          <col style={{ width: trailingSpacerWidth }} />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={cx(S.cell, S.headerCell, S.cornerCell)}>
              {t`MCP tools`}
            </th>
            <td className={S.spacerCell} aria-hidden />
            {virtualColumns.map((virtualColumn) => {
              const column = columns[virtualColumn.index];
              const { group } = column;
              return (
                <th
                  key={group.id}
                  scope="col"
                  className={cx(S.cell, S.headerCell)}
                >
                  {column.isAdminGroup ? (
                    <Ellipsified>{getGroupNameLocalized(group)}</Ellipsified>
                  ) : (
                    <GroupHeaderMenu
                      column={column}
                      allTools={allTools}
                      onPermissionChange={onPermissionChange}
                    />
                  )}
                </th>
              );
            })}
            <td className={S.spacerCell} aria-hidden />
            <td
              className={cx(
                S.cell,
                S.headerCell,
                S.fillerHeaderCell,
                S.fillerCell,
              )}
            >
              {headerTrailing}
            </td>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <McpToolsGridRow
              key={row.id}
              row={row}
              columns={columns}
              virtualColumns={virtualColumns}
              allTools={allTools}
              onPermissionChange={onPermissionChange}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
