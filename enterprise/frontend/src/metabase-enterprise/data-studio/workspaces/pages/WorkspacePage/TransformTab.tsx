import { useDisclosure } from "@mantine/hooks";
import { useCallback } from "react";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Button, Group, Icon, Stack, rem } from "metabase/ui";
import { useRunTransformMutation, workspaceApi } from "metabase-enterprise/api";
import {
  deactivateSuggestedTransform,
  getMetabotSuggestedTransform,
} from "metabase-enterprise/metabot/state";
import { UpdateTargetModal } from "metabase-enterprise/transforms/pages/TransformTargetPage/TargetSection/UpdateTargetModal";
import {
  isSameSource,
  isTransformRunning,
} from "metabase-enterprise/transforms/utils";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
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
  workspaceTransforms: Transform[];
  onChange: (patch: Partial<EditedTransform>) => void;
  onOpenTransform: (transformId: TransformId) => void;
}

export const TransformTab = ({
  databaseId,
  editedTransform,
  transform,
  workspaceId,
  workspaceTransforms,
  onChange,
  onOpenTransform,
}: Props) => {
  const { updateTransformState } = useWorkspace();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const [
    isChangeTargetModalOpen,
    { open: openChangeTargetModal, close: closeChangeTargetModal },
  ] = useDisclosure();
  const dispatch = useDispatch();
  const suggestedTransform = useSelector((state) =>
    getMetabotSuggestedTransform(state, transform.id),
  );
  const metadata = useSelector(getMetadata);

  const normalizeSource = useCallback(
    (source: DraftTransformSource) => {
      if (source.type !== "query") {
        return source;
      }

      const question = Question.create({
        dataset_query: source.query,
        metadata,
      });
      const query = question.query();
      const { isNative } = Lib.queryDisplayInfo(query);
      const normalizedQuery = isNative
        ? Lib.withNativeQuery(query, Lib.rawNativeQuery(query))
        : query;

      return {
        type: "query",
        query: question.setQuery(normalizedQuery).datasetQuery(),
      };
    },
    [metadata],
  );

  const proposedSource =
    suggestedTransform?.source &&
    !isSameSource(suggestedTransform.source, editedTransform.source)
      ? normalizeSource(suggestedTransform.source)
      : undefined;

  const hasSourceChanged = !isSameSource(
    editedTransform.source,
    transform.source,
  );
  const hasChanges = hasSourceChanged;

  const isSaved = workspaceTransforms.some((t) => t.id === transform.id);

  const [runTransform] = useRunTransformMutation();

  const handleRun = async () => {
    try {
      await runTransform(transform.id).unwrap();

      // Invalidate the workspace tables cache since transform execution
      // may affect the list of workspace tables.
      if (isSaved) {
        dispatch(
          workspaceApi.util.invalidateTags([
            { type: "workspace", id: workspaceId },
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

  const handleAcceptProposed = useCallback(() => {
    if (proposedSource == null) {
      return;
    }

    if (!isSaved) {
      sendErrorToast(
        t`Add this transform to the workspace before applying Metabot changes.`,
      );
      return;
    }

    onChange({ source: proposedSource });
    dispatch(deactivateSuggestedTransform(suggestedTransform?.id));
  }, [
    proposedSource,
    onChange,
    dispatch,
    suggestedTransform?.id,
    isSaved,
    sendErrorToast,
  ]);

  const handleRejectProposed = useCallback(() => {
    if (suggestedTransform) {
      dispatch(deactivateSuggestedTransform(suggestedTransform.id));
    }
  }, [dispatch, suggestedTransform]);

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
        <Group>
          {isSaved && (
            <Button
              leftSection={<Icon name="pencil_lines" />}
              size="sm"
              disabled={isRunning || hasChanges}
              onClick={openChangeTargetModal}
            >{t`Change target`}</Button>
          )}
        </Group>

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
            <SaveTransformButton
              databaseId={databaseId}
              editedTransform={editedTransform}
              transform={transform}
              workspaceId={workspaceId}
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
            proposedSource={proposedSource}
            onAcceptProposed={handleAcceptProposed}
            onRejectProposed={handleRejectProposed}
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
