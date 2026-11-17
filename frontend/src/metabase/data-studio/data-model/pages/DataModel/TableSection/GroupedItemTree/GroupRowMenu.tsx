import { t } from "ttag";

import { ActionIcon, Icon, Menu } from "metabase/ui";

/** A group row's overflow menu: edit its settings, or delete it */
export function GroupRowMenu({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          aria-label={t`Group actions`}
          onClick={(event) => event.stopPropagation()}
        >
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
        <Menu.Item leftSection={<Icon name="pencil" />} onClick={onEdit}>
          {t`Edit group`}
        </Menu.Item>
        <Menu.Item
          leftSection={<Icon name="trash" />}
          c="feedback-negative"
          onClick={onDelete}
        >
          {t`Delete group`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
