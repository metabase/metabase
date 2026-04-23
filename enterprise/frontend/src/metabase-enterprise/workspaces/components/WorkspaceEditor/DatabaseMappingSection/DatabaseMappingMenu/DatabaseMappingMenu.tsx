import type { ReactNode } from "react";
import { t } from "ttag";

import { Icon, Menu } from "metabase/ui";

type DatabaseMappingMenuProps = {
  children: ReactNode;
  onUpdate: () => void;
  onDelete: () => void;
};

export function DatabaseMappingMenu({
  children,
  onUpdate,
  onDelete,
}: DatabaseMappingMenuProps) {
  return (
    <Menu>
      <Menu.Target>{children}</Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<Icon name="pencil" />} onClick={onUpdate}>
          {t`Edit`}
        </Menu.Item>
        <Menu.Item leftSection={<Icon name="trash" />} onClick={onDelete}>
          {t`Delete`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
