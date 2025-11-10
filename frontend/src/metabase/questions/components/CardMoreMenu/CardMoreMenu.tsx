import { type ReactNode, useState } from "react";
import { c, t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { getMetadata } from "metabase/selectors/metadata";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Card } from "metabase-types/api";

import { ArchiveCardModal } from "../ArchiveCardModal";
import { MoveCardModal } from "../MoveCardModal";

type CardModalType = "add-to-dashboard" | "move" | "copy" | "archive";

type CardMoreMenuProps = {
  card: Card;
  onArchive?: () => void;
  onUnarchive?: () => void;
};

export function CardMoreMenu({
  card,
  onArchive,
  onUnarchive,
}: CardMoreMenuProps) {
  const [modalType, setModalType] = useState<CardModalType>();
  return (
    <>
      <CardMenu card={card} onOpenModal={setModalType} />
      {modalType != null && (
        <CardModal
          card={card}
          modalType={modalType}
          onArchive={onArchive}
          onUnarchive={onUnarchive}
          onClose={() => setModalType(undefined)}
        />
      )}
    </>
  );
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
        onClick={() => onOpenModal("copy")}
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

type CardModalProps = {
  card: Card;
  modalType: CardModalType;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onClose: () => void;
};

function CardModal({
  card,
  modalType,
  onArchive,
  onUnarchive,
  onClose,
}: CardModalProps) {
  switch (modalType) {
    case "move":
      return <MoveCardModal card={card} onClose={onClose} />;
    case "archive":
      return (
        <ArchiveCardModal
          card={card}
          onArchive={onArchive}
          onUnarchive={onUnarchive}
          onClose={onClose}
        />
      );
    default:
      return null;
  }
}
