import type { MouseEvent } from "react";
import { t } from "ttag";

import { ActionIcon, Icon, Menu } from "metabase/ui";
import type { WorkspaceDatabase } from "metabase-types/api";

type DatabaseMenuProps = {
  workspaceDatabase: WorkspaceDatabase;
  onEdit: (workspaceDatabase: WorkspaceDatabase) => void;
  onDelete: (workspaceDatabase: WorkspaceDatabase) => void;
};

export function DatabaseMenu({
  workspaceDatabase,
  onEdit,
  onDelete,
}: DatabaseMenuProps) {
  const handleClick = (event: MouseEvent) => {
    // prevent the table row from being clicked
    event.stopPropagation();
  };

  return (
    <div onClick={handleClick}>
      <Menu position="bottom-end">
        <Menu.Target>
          <ActionIcon size="sm">
            <Icon name="ellipsis" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<Icon name="pencil" />}
            onClick={() => onEdit(workspaceDatabase)}
          >
            {t`Edit`}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="trash" />}
            onClick={() => onDelete(workspaceDatabase)}
          >
            {t`Delete`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </div>
  );
}
