import cx from "classnames";
import { c } from "ttag";

import { ActionIcon, Group, Icon, Text, Tooltip } from "metabase/ui";
import type { McpTool } from "metabase-types/api";

import S from "./McpToolsGrid.module.css";

const INFO_ICON_SIZE = 14;
const TOOLTIP_MAX_WIDTH = 320;

type ToolNameCellProps = { tool: McpTool };

export function ToolNameCell({ tool }: ToolNameCellProps) {
  return (
    <th scope="row" className={cx(S.cell, S.pinnedCell)}>
      <Group gap="sm" justify="space-between" wrap="nowrap">
        <Text truncate>{tool.name}</Text>
        <Tooltip
          label={tool.description}
          multiline
          maw={TOOLTIP_MAX_WIDTH}
          position="right"
        >
          <ActionIcon
            variant="subtle"
            size="xs"
            c="text-tertiary"
            aria-label={c("{0} is an MCP tool name").t`About ${tool.name}`}
          >
            <Icon name="info" size={INFO_ICON_SIZE} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </th>
  );
}
