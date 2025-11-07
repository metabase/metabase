import { type ReactNode, useState } from "react";
import { c, t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { getMetadata } from "metabase/selectors/metadata";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Card } from "metabase-types/api";

type CardModalType = "add-to-dashboard" | "move" | "duplicate" | "archive";

type CardMoreMenuProps = {
  card: Card;
};

export function CardMoreMenu({ card }: CardMoreMenuProps) {
  const [_modalType, setModalType] = useState<CardModalType>();
  return <CardMenu card={card} onOpenModal={setModalType} />;
}

type CardMenuProps = {
  card: Card;
  onOpenModal: (modalType: CardModalType) => void;
};

function CardMenu({ card, onOpenModal }: CardMenuProps) {
  const menuItems: ReactNode[] = [];
  menuItems.push(...PLUGIN_MODERATION.useCardMenuItems(card));

  const metadata = useSelector(getMetadata);
  const query = Lib.fromJsQueryAndMetadata(metadata, card.dataset_query);
  const queryInfo = Lib.queryDisplayInfo(query);

  if (card.type === "metric") {
    menuItems.push(
      <Menu.Item
        key="add_to_dash"
        leftSection={<Icon name="add_to_dash" />}
        onClick={() => onOpenModal("add-to-dashboard")}
      >
        {t`Add to dashboard`}
      </Menu.Item>,
    );
  }

  if (card.can_write) {
    menuItems.push(
      <Menu.Item
        key="move"
        leftSection={<Icon name="move" />}
        onClick={() => onOpenModal("move")}
      >
        {c("A verb, not a noun").t`Move`}
      </Menu.Item>,
    );
  }

  if (queryInfo.isEditable) {
    menuItems.push(
      <Menu.Item
        key="duplicate"
        leftSection={<Icon name="clone" />}
        onClick={() => onOpenModal("duplicate")}
      >
        {c("A verb, not a noun").t`Duplicate`}
      </Menu.Item>,
    );
  }

  if (card.can_write) {
    menuItems.push(
      <Menu.Item
        key="archive"
        leftSection={<Icon name="trash" />}
        onClick={() => onOpenModal("archive")}
      >
        {t`Move to trash`}
      </Menu.Item>,
    );
  }

  if (menuItems.length === 0) {
    return null;
  }

  return (
    <Menu>
      <Menu.Target>
        <ActionIcon>
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>{menuItems}</Menu.Dropdown>
    </Menu>
  );
}
