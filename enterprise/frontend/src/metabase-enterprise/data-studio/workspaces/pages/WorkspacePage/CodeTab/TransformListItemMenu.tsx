import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import { useDeleteWorkspaceTransformMutation } from "metabase-enterprise/api";
import type {
  Transform,
  WorkspaceId,
  WorkspaceTransformItem,
} from "metabase-types/api";

import { useWorkspace } from "../WorkspaceProvider";

interface Props {
  transform: WorkspaceTransformItem | Transform;
  workspaceId: WorkspaceId;
}

export function TransformListItemMenu({ transform, workspaceId }: Props) {
  const [deleteWorkspaceTransform] = useDeleteWorkspaceTransformMutation();

  const {
    removeEditedTransform,
    removeOpenedTransform,
    removeUnsavedTransform,
  } = useWorkspace();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();

  const handleRemove = async () => {
    // Handle unsaved transforms (negative IDs) locally
    if ("id" in transform && transform.id < 0) {
      removeUnsavedTransform(transform.id);
      return;
    }

    if (!("ref_id" in transform)) {
      return;
    }

    try {
      await deleteWorkspaceTransform({
        workspaceId,
        transformId: transform.ref_id,
      }).unwrap();

      sendSuccessToast(t`Transform removed from the workspace`);
      removeEditedTransform(transform.ref_id);
      removeOpenedTransform(transform.ref_id);
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
