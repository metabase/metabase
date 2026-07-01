import { t } from "ttag";

import { ActionIcon, Icon, Menu } from "metabase/ui";
import type { TableIndexEntry } from "metabase-types/api";

type IndexRowMenuProps = {
  index: TableIndexEntry;
  onEdit: (index: TableIndexEntry) => void;
  onDelete: (index: TableIndexEntry) => void;
};

export function IndexRowMenu({ index, onEdit, onDelete }: IndexRowMenuProps) {
  const isManaged = index.metabase_managed && index.request?.id !== undefined;
  const isPendingDeletion = index.request?.status === "delete-pending";

  if (!isManaged) {
    return null;
  }

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon aria-label={t`Index actions`}>
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<Icon name="pencil" />}
          onClick={() => onEdit(index)}
          disabled={isPendingDeletion}
        >
          {t`Edit`}
        </Menu.Item>
        <Menu.Item
          c="danger"
          leftSection={<Icon name="trash" />}
          onClick={() => onDelete(index)}
          disabled={isPendingDeletion}
        >
          {t`Delete`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
