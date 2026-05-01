import type { MouseEvent } from "react";
import { t } from "ttag";

import { ActionIcon, Icon, Menu } from "metabase/ui";
import type { WorkspaceAccessKey } from "metabase-types/api";

type AccessKeyMenuProps = {
  accessKey: WorkspaceAccessKey;
  onEdit: (accessKey: WorkspaceAccessKey) => void;
  onDelete: (accessKey: WorkspaceAccessKey) => void;
};

export function AccessKeyMenu({
  accessKey,
  onEdit,
  onDelete,
}: AccessKeyMenuProps) {
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
            onClick={() => onEdit(accessKey)}
          >
            {t`Rename`}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="trash" />}
            onClick={() => onDelete(accessKey)}
          >
            {t`Delete`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </div>
  );
}
