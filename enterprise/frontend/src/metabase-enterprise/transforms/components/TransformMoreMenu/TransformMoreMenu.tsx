import { type MouseEvent, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import type { TransformId } from "metabase-types/api";

import type { TransformMoreMenuModalState } from "../../types";

import { DeleteTransformModal } from "./DeleteTransformModal";

type TransformMoreMenuProps = {
  transformId: TransformId;
  onOpenModal: (modal: TransformMoreMenuModalState) => void;
};

export function TransformMoreMenu({
  transformId,
  onOpenModal,
}: TransformMoreMenuProps) {
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
          onClick={() => onOpenModal({ transformId, modalType: "delete" })}
        >
          {t`Delete`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

type TransformMoreMenuModalProps = {
  modal: TransformMoreMenuModalState;
  onClose: () => void;
};

export function TransformMoreMenuModal({
  modal,
  onClose,
}: TransformMoreMenuModalProps) {
  const { sendSuccessToast } = useMetadataToasts();
  const dispatch = useDispatch();

  const handleDelete = () => {
    sendSuccessToast(t`Transform deleted`);
    dispatch(push(Urls.transformList()));
    onClose();
  };

  switch (modal.modalType) {
    case "delete":
      return (
        <DeleteTransformModal
          transformId={modal.transformId}
          onDelete={handleDelete}
          onClose={onClose}
        />
      );
    default:
      return null;
  }
}

type TransformMoreMenuWithModalProps = {
  transformId: TransformId;
};

export function TransformMoreMenuWithModal({
  transformId,
}: TransformMoreMenuWithModalProps) {
  const [modal, setModal] = useState<TransformMoreMenuModalState>();

  return (
    <>
      <TransformMoreMenu transformId={transformId} onOpenModal={setModal} />
      {modal != null && (
        <TransformMoreMenuModal
          modal={modal}
          onClose={() => setModal(undefined)}
        />
      )}
    </>
  );
}
