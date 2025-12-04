import { useDisclosure } from "@mantine/hooks";
import { useCallback } from "react";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box, Button, Group, Icon, Stack, rem } from "metabase/ui";
import { useRunTransformMutation, workspaceApi } from "metabase-enterprise/api";
import { UpdateTargetModal } from "metabase-enterprise/transforms/pages/TransformTargetPage/TargetSection/UpdateTargetModal";
import {
  isSameSource,
  isTransformRunning,
} from "metabase-enterprise/transforms/utils";
import type {
  DatabaseId,
  DraftTransformSource,
  Transform,
  TransformId,
  WorkspaceId,
} from "metabase-types/api";

import { CheckOutTransformButton } from "./CheckOutTransformButton";
import { SaveTransformButton } from "./SaveTransformButton";
import { TransformEditor } from "./TransformEditor";
import { type EditedTransform, useWorkspace } from "./WorkspaceProvider";

interface Props {
  databaseId: DatabaseId;
  editedTransform: EditedTransform;
  transform: Transform;
  workspaceId: WorkspaceId;
  onChange: (patch: Partial<EditedTransform>) => void;
  onOpenTransform: (transformId: TransformId) => void;
}

export const TransformTab = ({
  databaseId,
  editedTransform,
  transform,
  workspaceId,
  onChange,
  onOpenTransform,
}: Props) => {
  const { updateTransformState } = useWorkspace();
  const { sendSuccessToast } = useMetadataToasts();
  const [
    isChangeTargetModalOpen,
    { open: openChangeTargetModal, close: closeChangeTargetModal },
  ] = useDisclosure();
  const dispatch = useDispatch();

  const hasSourceChanged = !isSameSource(
    editedTransform.source,
    transform.source,
  );
  const hasChanges = hasSourceChanged;

  const isSaved = transform.workspace_id === workspaceId;

  const [runTransform] = useRunTransformMutation();

  const handleRun = async () => {
    try {
      await runTransform(transform.id).unwrap();

      // Invalidate the workspace tables cache since transform execution
      // may affect the list of workspace tables.
      if (transform.workspace_id) {
        dispatch(
          workspaceApi.util.invalidateTags([
            { type: "workspace", id: transform.workspace_id },
          ]),
        );
      }
    } catch (error) {
      console.error("Failed to run transform", error);
    }
  };

  const handleSourceChange = (source: DraftTransformSource) => {
    onChange({ source });
  };

  const handleTargetUpdate = useCallback(
    (updatedTransform: Transform) => {
      const hasNameChanged = editedTransform.name !== transform.name;
      const hasSourceChanged = !isSameSource(
        editedTransform.source,
        transform.source,
      );

      const editedTransformToKeep =
        hasNameChanged || hasSourceChanged
          ? {
              name: editedTransform.name,
              source: editedTransform.source,
              target: {
                type: updatedTransform.target.type,
                name: updatedTransform.target.name,
              },
            }
          : null;

      updateTransformState(updatedTransform, editedTransformToKeep);
      sendSuccessToast(t`Transform target updated`);
      closeChangeTargetModal();
    },
    [
      closeChangeTargetModal,
      editedTransform.name,
      editedTransform.source,
      transform.name,
      transform.source,
      updateTransformState,
      sendSuccessToast,
    ],
  );

  const isRunning = isTransformRunning(transform);

  return (
    <Stack gap={0} h="100%">
      <Group
        flex="0 0 auto"
        justify="space-between"
        mih={rem(73)} // avoid CLS when showing/hiding output table input
        p="md"
        style={{ borderBottom: "1px solid var(--mb-color-border)" }}
      >
        <Group />

        <Group>
          {isSaved && (
            <Button
              disabled={hasChanges}
              leftSection={<Icon name="play" />}
              size="sm"
              onClick={handleRun}
            >{t`Run`}</Button>
          )}

          {isSaved && (
            <Button
              leftSection={<Icon name="pencil_lines" />}
              size="sm"
              disabled={isRunning}
              onClick={openChangeTargetModal}
            >{t`Change target`}</Button>
          )}

          {isSaved && (
            <SaveTransformButton
              databaseId={databaseId}
              editedTransform={editedTransform}
              transform={transform}
            />
          )}

          {!isSaved && (
            <CheckOutTransformButton
              transform={transform}
              workspaceId={workspaceId}
              onOpenTransform={onOpenTransform}
            />
          )}
        </Group>
      </Group>

      {editedTransform && (
        <Box flex="1">
          <TransformEditor
            disabled={!isSaved}
            source={editedTransform.source}
            onChange={handleSourceChange}
          />
        </Box>
      )}

      {isChangeTargetModalOpen && (
        <UpdateTargetModal
          transform={transform}
          onUpdate={handleTargetUpdate}
          onClose={closeChangeTargetModal}
        />
      )}
    </Stack>
  );
};
