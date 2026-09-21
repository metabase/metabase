import type { MouseEvent } from "react";
import { t } from "ttag";

import { ActionIcon, Icon, Menu } from "metabase/ui";
import type { TableIndexEntry } from "metabase-types/api";

import { isManagedIndex, isPendingDeletion } from "./utils";

type IndexRowMenuProps = {
  index: TableIndexEntry;
  onEdit: (index: TableIndexEntry) => void;
  onDelete: (index: TableIndexEntry) => void;
};

export function IndexRowMenu({ index, onEdit, onDelete }: IndexRowMenuProps) {
  if (!isManagedIndex(index)) {
    return null;
  }

  const isDisabled = isPendingDeletion(index);

  function handleIconClick(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon aria-label={t`Index actions`} onClick={handleIconClick}>
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
        <Menu.Item
          leftSection={<Icon name="pencil" />}
          onClick={() => onEdit(index)}
          disabled={isDisabled}
        >
          {t`Edit`}
        </Menu.Item>
        <Menu.Item
          c={isDisabled ? undefined : "danger"}
          leftSection={<Icon name="trash" />}
          onClick={() => onDelete(index)}
          disabled={isDisabled}
        >
          {t`Delete`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
