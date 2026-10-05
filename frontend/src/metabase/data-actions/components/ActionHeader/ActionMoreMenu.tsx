import { useState } from "react";
import { t } from "ttag";

import { useUpdateActionMutation } from "metabase/api";
import { useMetadataToasts } from "metabase/common/hooks";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useNavigate } from "metabase/router";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { WritebackAction } from "metabase-types/api";

import { MoveActionModal } from "./MoveActionModal";

type ActionMoreMenuProps = {
  action: WritebackAction;
  readOnly?: boolean;
};

export function ActionMoreMenu({ action, readOnly }: ActionMoreMenuProps) {
  const [isMoveModalOpened, setIsMoveModalOpened] = useState(false);
  const { modalContent: confirmationModal, show: showConfirmation } =
    useConfirmation();
  const [updateAction] = useUpdateActionMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const navigate = useNavigate();

  const handleArchive = async () => {
    const { error } = await updateAction({ id: action.id, archived: true });
    if (error) {
      sendErrorToast(t`Failed to archive action`);
      return;
    }
    sendSuccessToast(t`Action archived`);
    navigate(Urls.dataActionList());
  };

  const handleArchiveClick = () => {
    showConfirmation({
      title: t`Archive "${action.name}"?`,
      message: t`Dashboard buttons and public forms that use this action will stop working.`,
      confirmButtonText: t`Archive`,
      confirmButtonProps: { color: "negative" },
      onConfirm: handleArchive,
    });
  };

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
              onClick={() => setIsMoveModalOpened(true)}
            >
              {t`Move`}
            </Menu.Item>
          )}
          {!readOnly && (
            <Menu.Item
              leftSection={<Icon name="archive" />}
              onClick={handleArchiveClick}
            >
              {t`Archive`}
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>
      {isMoveModalOpened && (
        <MoveActionModal
          action={action}
          onClose={() => setIsMoveModalOpened(false)}
        />
      )}
      {confirmationModal}
    </>
  );
}
