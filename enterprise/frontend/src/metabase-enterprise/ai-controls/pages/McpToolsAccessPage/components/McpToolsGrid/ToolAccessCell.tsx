import { c } from "ttag";

import { getGroupNameLocalized } from "metabase/common/utils/groups";
import { Checkbox, Flex } from "metabase/ui";
import type { McpGroupPermission, McpTool } from "metabase-types/api";

import S from "./McpToolsGrid.module.css";
import type { McpToolsGridColumn } from "./types";
import { isToolAllowed, setToolsAllowed } from "./utils";

type ToolAccessCellProps = {
  column: McpToolsGridColumn;
  tool: McpTool;
  allTools: McpTool[];
  onPermissionChange: (permission: McpGroupPermission) => void;
};

export function ToolAccessCell({
  column,
  tool,
  allTools,
  onPermissionChange,
}: ToolAccessCellProps) {
  const { group, permission, isAdminGroup } = column;

  return (
    <td className={S.cell}>
      <Flex justify="center" align="center">
        <Checkbox
          aria-label={c("{0} is the user group name, {1} is an MCP tool name")
            .t`Allow ${getGroupNameLocalized(group)} user group to use the ${tool.name} MCP tool.`}
          checked={isAdminGroup || isToolAllowed(permission, tool)}
          disabled={isAdminGroup}
          onChange={(event) =>
            onPermissionChange(
              setToolsAllowed(
                permission,
                allTools,
                [tool],
                event.target.checked,
              ),
            )
          }
        />
      </Flex>
    </td>
  );
}
