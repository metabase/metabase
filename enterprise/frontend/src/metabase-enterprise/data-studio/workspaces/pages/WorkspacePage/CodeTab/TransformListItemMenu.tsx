import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import { useUpdateWorkspaceContentsMutation } from "metabase-enterprise/api";
import type { Transform, WorkspaceId } from "metabase-types/api";

import { useWorkspace } from "../WorkspaceProvider";

interface Props {
  transform: Transform;
  workspaceId: WorkspaceId;
}

export function TransformListItemMenu({ transform, workspaceId }: Props) {
  const [updateWorkspaceContents] = useUpdateWorkspaceContentsMutation();
  const {
    removeEditedTransform,
    removeOpenedTransform,
    removeUnsavedTransform,
  } = useWorkspace();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();

  const handleRemove = async () => {
    // Handle unsaved transforms (negative IDs) locally
    if (transform.id < 0) {
      removeUnsavedTransform(transform.id);
      return;
    }

    const response = await updateWorkspaceContents({
      id: workspaceId,
      remove: {
        transforms: [transform.id],
      },
    });

    if (response.error) {
      sendErrorToast(t`Failed to remove transform from the workspace`);
    } else {
      sendSuccessToast(t`Transform removed from the workspace`);
      removeEditedTransform(transform.id);
      removeOpenedTransform(transform.id);
    }
  };

  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon
          onClick={(event) => event.stopPropagation()}
          size="sm"
          variant="subtle"
        >
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>

      <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
        <Menu.Item leftSection={<Icon name="trash" />} onClick={handleRemove}>
          {t`Remove`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
