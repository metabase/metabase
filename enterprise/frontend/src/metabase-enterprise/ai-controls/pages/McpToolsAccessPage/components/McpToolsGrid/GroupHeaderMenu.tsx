import { useWindowEvent } from "@mantine/hooks";
import { useState } from "react";
import { t } from "ttag";

import { getGroupNameLocalized } from "metabase/common/utils/groups";
import { Ellipsified, Menu, UnstyledButton } from "metabase/ui";
import type { McpGroupPermission, McpTool } from "metabase-types/api";

import S from "./McpToolsGrid.module.css";
import type { McpToolsGridColumn } from "./types";
import { getToolsAccessState, setToolsAllowed } from "./utils";

type GroupHeaderMenuProps = {
  column: McpToolsGridColumn;
  allTools: McpTool[];
  onPermissionChange: (permission: McpGroupPermission) => void;
};

export function GroupHeaderMenu({
  column,
  allTools,
  onPermissionChange,
}: GroupHeaderMenuProps) {
  const { group, permission } = column;
  const state = getToolsAccessState(permission, allTools);
  const [opened, setOpened] = useState(false);

  // The dropdown is positioned once; a scroll of the grid would leave it floating.
  useWindowEvent("scroll", () => setOpened(false), { capture: true });

  return (
    <Menu position="bottom" shadow="md" opened={opened} onChange={setOpened}>
      <Menu.Target>
        <UnstyledButton className={S.headerButton}>
          <Ellipsified>{getGroupNameLocalized(group)}</Ellipsified>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          disabled={state === "all"}
          onClick={() =>
            onPermissionChange(
              setToolsAllowed(permission, allTools, allTools, true),
            )
          }
        >
          {t`Allow all tools`}
        </Menu.Item>
        <Menu.Item
          disabled={state === "none"}
          onClick={() =>
            onPermissionChange(
              setToolsAllowed(permission, allTools, allTools, false),
            )
          }
        >
          {t`Block all tools`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
