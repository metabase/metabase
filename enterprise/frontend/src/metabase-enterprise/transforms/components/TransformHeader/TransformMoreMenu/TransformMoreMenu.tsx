import { type MouseEvent, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import type { Transform } from "metabase-types/api";

import { TransformRevisionHistorySidebar } from "../../TransformRevisionHistorySidebar";

import { DeleteTransformModal } from "./DeleteTransformModal";
import { MoveTransformModal } from "./MoveTransformModal";
import type { TransformMoreMenuModalType } from "./types";

type TransformMoreMenuProps = {
  readOnly?: boolean;
  transform: Transform;
};

export function TransformMoreMenu({
  readOnly,
  transform,
}: TransformMoreMenuProps) {
  const [modalType, setModalType] = useState<TransformMoreMenuModalType>();
  const [isHistorySidebarOpen, setIsHistorySidebarOpen] = useState(false);

  return (
    <>
      <TransformMenu
        onOpenModal={setModalType}
        onShowHistory={() => setIsHistorySidebarOpen(true)}
        readOnly={readOnly}
      />
      {modalType != null && (
        <TransformModal
          transform={transform}
          modalType={modalType}
          onClose={() => setModalType(undefined)}
        />
      )}
      {isHistorySidebarOpen && (
        <TransformRevisionHistorySidebar
          transform={transform}
          onClose={() => setIsHistorySidebarOpen(false)}
        />
      )}
    </>
  );
}

type TransformMenuProps = {
  onOpenModal: (modalType: TransformMoreMenuModalType) => void;
  onShowHistory: () => void;
  readOnly?: boolean;
};

function TransformMenu({
  onOpenModal,
  onShowHistory,
  readOnly,
}: TransformMenuProps) {
  const handleIconClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <Menu>
      <Menu.Target>
        <ActionIcon size="sm" onClick={handleIconClick}>
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<Icon name="history" />}
          onClick={onShowHistory}
        >
          {t`History`}
        </Menu.Item>
        {!readOnly && (
          <>
            <Menu.Item
              leftSection={<Icon name="move" />}
              onClick={() => onOpenModal("move")}
            >
              {t`Move`}
            </Menu.Item>
            <Menu.Item
              leftSection={<Icon name="trash" />}
              onClick={() => onOpenModal("delete")}
            >
              {t`Delete`}
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

type TransformModalProps = {
  transform: Transform;
  modalType: TransformMoreMenuModalType;
  onClose: () => void;
};

function TransformModal({
  transform,
  modalType,
  onClose,
}: TransformModalProps) {
  const { sendSuccessToast } = useMetadataToasts();
  const dispatch = useDispatch();

  const handleDelete = () => {
    sendSuccessToast(t`Transform deleted`);
    dispatch(push(Urls.transformList()));
    onClose();
  };

  const handleMove = () => {
    sendSuccessToast(t`Transform moved`);
    onClose();
  };

  switch (modalType) {
    case "delete":
      return (
        <DeleteTransformModal
          transform={transform}
          onDelete={handleDelete}
          onClose={onClose}
        />
      );
    case "move":
      return (
        <MoveTransformModal
          transform={transform}
          onMove={handleMove}
          onClose={onClose}
        />
      );
    default:
      return null;
  }
}
