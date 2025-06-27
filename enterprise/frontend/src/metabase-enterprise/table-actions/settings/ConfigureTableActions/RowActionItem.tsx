import { t } from "ttag";

import { ActionIcon, Group, Icon, Menu, Text } from "metabase/ui";
import type { TableActionDisplaySettings } from "metabase-types/api";

import S from "./RowActionItem.module.css";

type RowActionItemProps = {
  action: TableActionDisplaySettings;
  onRemove: (id: TableActionDisplaySettings["id"]) => void;
  onEdit: (action: TableActionDisplaySettings) => void;
};

export const RowActionItem = ({
  action,
  onRemove,
  onEdit,
}: RowActionItemProps) => {
  const { id, name } = action;

  return (
    <Group
      p={0}
      justify="space-between"
      align="center"
      className={S.rowActionItem}
    >
      <Group gap="0.5rem">
        <Icon name="unknown" /> <Text>{name}</Text>
      </Group>

      <div className={S.iconGroup}>
        <Menu>
          <Menu.Target>
            <ActionIcon variant="subtle" className={S.actionIcon}>
              <Icon name="ellipsis" />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={() => onEdit(action)}>
              {t`Edit custom action`}
            </Menu.Item>
            <Menu.Item onClick={() => onRemove(id)} color="error">
              {t`Delete custom action`}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>
    </Group>
  );
};
