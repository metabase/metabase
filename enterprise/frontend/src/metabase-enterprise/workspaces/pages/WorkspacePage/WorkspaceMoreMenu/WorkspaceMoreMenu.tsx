import { push } from "react-router-redux";
import { t } from "ttag";

import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { useDispatch } from "metabase/redux";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import { useDeleteWorkspaceMutation } from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

type WorkspaceMoreMenuProps = {
  workspace: Workspace;
};

export function WorkspaceMoreMenu({ workspace }: WorkspaceMoreMenuProps) {
  const dispatch = useDispatch();
  const [deleteWorkspace] = useDeleteWorkspaceMutation();
  const { sendSuccessToast } = useMetadataToasts();
  const { modalContent, show } = useConfirmation();

  const handleDelete = () => {
    show({
      title: t`Delete this workspace?`,
      message: t`The writable schema and the database user will be dropped from each of the configured databases. This cannot be undone.`,
      confirmButtonText: t`Delete workspace`,
      confirmButtonProps: { variant: "filled", color: "error" },
      onConfirm: async () => {
        await deleteWorkspace(workspace.id).unwrap();
        sendSuccessToast(t`Workspace deleted`);
        dispatch(push(Urls.workspaceList()));
      },
    });
  };

  return (
    <>
      <Menu>
        <Menu.Target>
          <ActionIcon size="sm">
            <Icon name="ellipsis" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<Icon name="trash" />} onClick={handleDelete}>
            {t`Delete`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {modalContent}
    </>
  );
}
