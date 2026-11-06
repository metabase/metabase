import { c } from "ttag";

import { getGroupNameLocalized } from "metabase/common/utils/groups";
import { Checkbox, Flex } from "metabase/ui";
import type { McpGroupPermission, McpTool } from "metabase-types/api";

import S from "./McpToolsGrid.module.css";
import type { McpToolsGridColumn } from "./types";
import { getToolsAccessState, setToolsAllowed } from "./utils";

type BucketAccessCellProps = {
  column: McpToolsGridColumn;
  label: string;
  tools: McpTool[];
  allTools: McpTool[];
  disabled: boolean;
  onPermissionChange: (permission: McpGroupPermission) => void;
};

export function BucketAccessCell({
  column,
  label,
  tools,
  allTools,
  disabled,
  onPermissionChange,
}: BucketAccessCellProps) {
  const { group, permission, isAdminGroup } = column;
  const state = isAdminGroup ? "all" : getToolsAccessState(permission, tools);

  return (
    <td className={S.cell}>
      <Flex justify="center" align="center">
        <Checkbox
          aria-label={c(
            "{0} is the user group name, {1} is a group of MCP tools",
          )
            .t`Allow ${getGroupNameLocalized(group)} user group to use all ${label} MCP tools.`}
          checked={state === "all"}
          indeterminate={state === "some"}
          disabled={disabled || isAdminGroup}
          // A partly allowed bucket allows the rest on click, like a select-all checkbox.
          onChange={() =>
            onPermissionChange(
              setToolsAllowed(permission, allTools, tools, state !== "all"),
            )
          }
        />
      </Flex>
    </td>
  );
}
