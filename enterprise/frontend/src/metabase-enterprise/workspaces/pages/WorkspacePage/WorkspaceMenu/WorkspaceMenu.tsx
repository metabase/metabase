import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/redux";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Workspace } from "metabase-types/api";

import { useDeleteWorkspace } from "../../../hooks";

export type WorkspaceMenuProps = {
  workspace: Workspace;
};

export function WorkspaceMenu({ workspace }: WorkspaceMenuProps) {
  const dispatch = useDispatch();
  const { handleDelete, modalContent } = useDeleteWorkspace({
    onSuccess: () => dispatch(push(Urls.workspaceList())),
  });

  return (
    <>
      <Menu>
        <Menu.Target>
          <ActionIcon size="sm" aria-label={t`Workspace actions`}>
            <Icon name="ellipsis" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<Icon name="trash" />}
            onClick={() => handleDelete(workspace)}
          >
            {t`Delete`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {modalContent}
    </>
  );
}
