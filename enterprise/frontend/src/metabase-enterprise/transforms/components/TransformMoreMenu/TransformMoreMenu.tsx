import { type MouseEvent, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import type { Transform } from "metabase-types/api";

import { DeleteTransformModal } from "./DeleteTransformModal";
import type { TransformModalType } from "./types";

type TransformMoreMenuProps = {
  transform: Transform;
};

export function TransformMoreMenu({ transform }: TransformMoreMenuProps) {
  const [modalType, setModalType] = useState<TransformModalType | null>(null);

  const handleModalClose = () => {
    setModalType(null);
  };

  return (
    <>
      <TransformMenu onOpenModal={setModalType} />
      {modalType != null && (
        <TransformModal
          transform={transform}
          modalType={modalType}
          onClose={handleModalClose}
        />
      )}
    </>
  );
}

type TransformMenuProps = {
  onOpenModal: (modalType: TransformModalType) => void;
};

function TransformMenu({ onOpenModal }: TransformMenuProps) {
  const handleIconClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <Menu>
      <Menu.Target>
        <ActionIcon onClick={handleIconClick}>
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<Icon name="trash" />}
          onClick={() => onOpenModal("delete")}
        >
          {t`Delete`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

type TransformModalProps = {
  transform: Transform;
  modalType: TransformModalType;
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
  }
}
