import { c, t } from "ttag";

import { ActionIcon, Icon, Menu } from "metabase/ui";
import type { SearchResult } from "metabase-types/api";

import type { SearchResultModal } from "../shared/SearchResultModals";

export const ModelMoreMenu = ({
  item,
  onOpenModal,
}: {
  item: SearchResult;
  onOpenModal: (modal: SearchResultModal) => void;
}) => {
  const hasCollectionPermissions = !!item.can_write;

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon
          onClick={(e) => {
            // prevent triggering route change
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<Icon name="move" />}
          disabled={!hasCollectionPermissions}
          onClick={() => onOpenModal({ item, type: "move" })}
        >
          {c("A verb, not a noun").t`Move`}
        </Menu.Item>
        <Menu.Item
          leftSection={<Icon name="clone" />}
          onClick={() => onOpenModal({ item, type: "clone" })}
        >
          {c("A verb, not a noun").t`Duplicate`}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          leftSection={<Icon name="trash" />}
          disabled={!hasCollectionPermissions}
          onClick={() => onOpenModal({ item, type: "archive" })}
        >
          {t`Move to trash`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};
