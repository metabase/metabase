import { type ReactNode, useState } from "react";
import { c, t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getMetadata } from "metabase/selectors/metadata";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Card } from "metabase-types/api";

import { ArchiveCardModal } from "../ArchiveCardModal";
import { CardCopyModal } from "../CardCopyModal";
import { MoveCardModal } from "../MoveCardModal";

type CardModalType = "move" | "copy" | "archive";

type CardMoreMenuProps = {
  card: Card;
  onCopy?: (newCard: Card) => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
};

export function CardMoreMenu({
  card,
  onCopy,
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
          onCopy={onCopy}
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
  const metadata = useSelector(getMetadata);
  const query = Lib.fromJsQueryAndMetadata(metadata, card.dataset_query);
  const queryInfo = Lib.queryDisplayInfo(query);

  menuItems.push(
    <Menu.Item
      key="view"
      leftSection={<Icon name="external" />}
      component={ForwardRefLink}
      to={Urls.question(card)}
      target="_blank"
    >
      {c("A verb, not a noun").t`View`}
    </Menu.Item>,
  );

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
  onCopy?: (newCard: Card) => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onClose: () => void;
};

function CardModal({
  card,
  modalType,
  onCopy,
  onArchive,
  onUnarchive,
  onClose,
}: CardModalProps) {
  switch (modalType) {
    case "move":
      return <MoveCardModal card={card} onClose={onClose} />;
    case "copy":
      return <CardCopyModal card={card} onCopy={onCopy} onClose={onClose} />;
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
