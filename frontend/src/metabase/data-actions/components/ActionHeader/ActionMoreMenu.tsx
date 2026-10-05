import { useState } from "react";
import { t } from "ttag";

import { useUpdateActionMutation } from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { useMetadataToasts } from "metabase/common/hooks";
import { useNavigate } from "metabase/router";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { WritebackAction } from "metabase-types/api";

import { MoveActionModal } from "./MoveActionModal";

type ActionMoreMenuProps = {
  action: WritebackAction;
  readOnly?: boolean;
};

type ModalType = "move" | "archive";

export function ActionMoreMenu({ action, readOnly }: ActionMoreMenuProps) {
  const [modalType, setModalType] = useState<ModalType>();
  const closeModal = () => setModalType(undefined);

  return (
    <>
      <Menu>
        <Menu.Target>
          <ActionIcon size="sm" aria-label={t`Action options`}>
            <Icon name="ellipsis" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {!readOnly && action.model_id == null && (
            <Menu.Item
              leftSection={<Icon name="move" />}
              onClick={() => setModalType("move")}
            >
              {t`Move`}
            </Menu.Item>
          )}
          {!readOnly && (
            <Menu.Item
              leftSection={<Icon name="archive" />}
              onClick={() => setModalType("archive")}
            >
              {t`Archive`}
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>
      {modalType === "move" && (
        <MoveActionModal action={action} onClose={closeModal} />
      )}
      {modalType === "archive" && (
        <ArchiveActionModal action={action} onClose={closeModal} />
      )}
    </>
  );
}

type ArchiveActionModalProps = {
  action: WritebackAction;
  onClose: () => void;
};

function ArchiveActionModal({ action, onClose }: ArchiveActionModalProps) {
  const [updateAction] = useUpdateActionMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const navigate = useNavigate();

  const handleConfirm = async () => {
    const { error } = await updateAction({ id: action.id, archived: true });
    if (error) {
      sendErrorToast(t`Failed to archive action`);
      return;
    }
    sendSuccessToast(t`Action archived`);
    navigate(Urls.dataActionList());
  };

  return (
    <ConfirmModal
      opened
      title={t`Archive "${action.name}"?`}
      message={t`Dashboard buttons and public forms that use this action will stop working.`}
      confirmButtonText={t`Archive`}
      confirmButtonProps={{ color: "negative", variant: "filled" }}
      onConfirm={handleConfirm}
      onClose={onClose}
    />
  );
}
