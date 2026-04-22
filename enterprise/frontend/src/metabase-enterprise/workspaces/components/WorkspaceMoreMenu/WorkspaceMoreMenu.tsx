import { type MouseEvent, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import { useDispatch } from "metabase/utils/redux";
import * as Urls from "metabase/utils/urls";
import type { Workspace } from "metabase-types/api";

import { DeleteWorkspaceModal } from "./DeleteWorkspaceModal";

type WorkspaceMoreMenuProps = {
  workspace: Workspace;
};

export function WorkspaceMoreMenu({ workspace }: WorkspaceMoreMenuProps) {
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const { sendSuccessToast } = useMetadataToasts();
  const dispatch = useDispatch();

  const handleIconClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDelete = () => {
    sendSuccessToast(t`Workspace deleted`);
    setIsDeleteModalOpen(false);
    dispatch(push(Urls.workspaceList()));
  };

  return (
    <>
      <Menu>
        <Menu.Target>
          <ActionIcon size="sm" onClick={handleIconClick}>
            <Icon name="ellipsis" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<Icon name="trash" />}
            onClick={() => setIsDeleteModalOpen(true)}
          >
            {t`Delete`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {isDeleteModalOpen && (
        <DeleteWorkspaceModal
          workspace={workspace}
          onDelete={handleDelete}
          onClose={() => setIsDeleteModalOpen(false)}
        />
      )}
    </>
  );
}
