import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import { useDeleteWorkspaceTransformMutation } from "metabase-enterprise/api";
import type {
  UnsavedTransform,
  WorkspaceId,
  WorkspaceTransformListItem,
} from "metabase-types/api";
import { isUnsavedTransform } from "metabase-types/api";

import { useWorkspace } from "../WorkspaceProvider";

/** Item that can be displayed in the workspace transforms list */
type WorkspaceTransformItem = UnsavedTransform | WorkspaceTransformListItem;

interface Props {
  transform: WorkspaceTransformItem;
  workspaceId: WorkspaceId;
}

export function TransformListItemMenu({ transform, workspaceId }: Props) {
  const [deleteWorkspaceTransform] = useDeleteWorkspaceTransformMutation();

  const {
    removeEditedTransform,
    removeWorkspaceTransform,
    removeUnsavedTransform,
  } = useWorkspace();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();

  const handleRemove = async () => {
    // Handle unsaved transforms locally
    if (isUnsavedTransform(transform)) {
      removeUnsavedTransform(transform.id);
      return;
    }

    // For WorkspaceTransformListItem, use ref_id
    try {
      await deleteWorkspaceTransform({
        workspaceId,
        transformId: transform.ref_id,
      }).unwrap();

      sendSuccessToast(t`Transform removed from the workspace`);
      removeEditedTransform(transform.ref_id);
      removeWorkspaceTransform(transform.ref_id);
    } catch (error) {
      sendErrorToast(t`Failed to remove transform from the workspace`);
    }
  };

  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon
          onClick={(event) => event.stopPropagation()}
          size="sm"
          variant="subtle"
          aria-label={t`More actions`}
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
