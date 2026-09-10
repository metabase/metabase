import { t } from "ttag";

import { ActionIcon, Icon, Menu } from "metabase/ui";

export interface CardActionsMenuProps {
  onEdit: () => void;
  onRemove: () => void;
}

export function CardActionsMenu({ onEdit, onRemove }: CardActionsMenuProps) {
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon variant="subtle" size="sm" aria-label={t`Card actions`}>
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<Icon name="pencil" />} onClick={onEdit}>
          {t`Edit card`}
        </Menu.Item>
        <Menu.Item leftSection={<Icon name="trash" />} onClick={onRemove}>
          {t`Remove card`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
