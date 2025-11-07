import { type ReactNode, useState } from "react";
import { t } from "ttag";

import { ActionIcon, Icon, Menu } from "metabase/ui";
import type { Card } from "metabase-types/api";

type CardModalType = "archive";

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
