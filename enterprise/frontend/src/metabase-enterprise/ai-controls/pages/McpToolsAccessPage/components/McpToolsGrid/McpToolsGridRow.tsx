import type { VirtualItem } from "@tanstack/react-virtual";
import cx from "classnames";

import { Text } from "metabase/ui";
import type { McpGroupPermission, McpTool } from "metabase-types/api";

import S from "./McpToolsGrid.module.css";
import { ToolAccessCell } from "./ToolAccessCell";
import { ToolNameCell } from "./ToolNameCell";
import type { McpToolsGridRow as GridRow, McpToolsGridColumn } from "./types";

type McpToolsGridRowProps = {
  row: GridRow;
  columns: McpToolsGridColumn[];
  virtualColumns: VirtualItem[];
  allTools: McpTool[];
  onPermissionChange: (permission: McpGroupPermission) => void;
};

export function McpToolsGridRow({
  row,
  columns,
  virtualColumns,
  allTools,
  onPermissionChange,
}: McpToolsGridRowProps) {
  if (row.kind === "bucket") {
    return (
      <tr className={S.bucketRow}>
        <th scope="row" className={cx(S.cell, S.pinnedCell)}>
          <Text fw="bold" c="text-secondary">
            {row.label}
          </Text>
        </th>
        <td className={S.spacerCell} aria-hidden />
        {virtualColumns.map((virtualColumn) => (
          <td
            key={columns[virtualColumn.index].group.id}
            className={S.cell}
            aria-hidden
          />
        ))}
        <td className={S.spacerCell} aria-hidden />
        <td className={cx(S.cell, S.fillerCell)} aria-hidden />
      </tr>
    );
  }

  return (
    <tr>
      <ToolNameCell tool={row.tool} />
      <td className={S.spacerCell} aria-hidden />
      {virtualColumns.map((virtualColumn) => {
        const column = columns[virtualColumn.index];
        return (
          <ToolAccessCell
            key={column.group.id}
            column={column}
            tool={row.tool}
            allTools={allTools}
            onPermissionChange={onPermissionChange}
          />
        );
      })}
      <td className={S.spacerCell} aria-hidden />
      <td className={cx(S.cell, S.fillerCell)} />
    </tr>
  );
}
