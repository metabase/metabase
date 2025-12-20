import { type ReactNode, useState } from "react";
import { push } from "react-router-redux";
import { c, t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { ArchiveCardModal } from "metabase/questions/components/ArchiveCardModal";
import { CardCopyModal } from "metabase/questions/components/CardCopyModal";
import { MoveCardModal } from "metabase/questions/components/MoveCardModal";
import { getMetadata } from "metabase/selectors/metadata";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Card } from "metabase-types/api";

type MetricModalType = "move" | "copy" | "archive";

type MetricMoreMenuProps = {
  card: Card;
};

export function MetricMoreMenu({ card }: MetricMoreMenuProps) {
  const [modalType, setModalType] = useState<MetricModalType>();

  return (
    <>
      <MetricMenu card={card} onOpenModal={setModalType} />
      {modalType != null && (
        <MetricModal
          card={card}
          modalType={modalType}
          onClose={() => setModalType(undefined)}
        />
      )}
    </>
  );
}

type MetricMenuProps = {
  card: Card;
  onOpenModal: (modalType: MetricModalType) => void;
};

function MetricMenu({ card, onOpenModal }: MetricMenuProps) {
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
        <ActionIcon size="sm">
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>{menuItems}</Menu.Dropdown>
    </Menu>
  );
}

type MetricModalProps = {
  card: Card;
  modalType: MetricModalType;
  onClose: () => void;
};

function MetricModal({ card, modalType, onClose }: MetricModalProps) {
  const dispatch = useDispatch();

  const handleCopy = (newCard: Card) => {
    dispatch(push(Urls.dataStudioMetric(newCard.id)));
  };

  const handleArchive = () => {
    dispatch(push(Urls.dataStudioLibrary()));
  };

  const handleUnarchive = () => {
    dispatch(push(Urls.dataStudioMetric(card.id)));
  };

  switch (modalType) {
    case "move":
      return <MoveCardModal card={card} onClose={onClose} />;
    case "copy":
      return (
        <CardCopyModal card={card} onCopy={handleCopy} onClose={onClose} />
      );
    case "archive":
      return (
        <ArchiveCardModal
          card={card}
          onArchive={handleArchive}
          onUnarchive={handleUnarchive}
          onClose={onClose}
        />
      );
    default:
      return null;
  }
}
