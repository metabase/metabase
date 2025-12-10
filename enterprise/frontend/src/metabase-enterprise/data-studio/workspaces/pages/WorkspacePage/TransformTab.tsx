import { useDisclosure } from "@mantine/hooks";
import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Button, Group, Icon, Stack } from "metabase/ui";
import {
  useGetTransformQuery,
  useRunTransformMutation,
  workspaceApi,
} from "metabase-enterprise/api";
import {
  deactivateSuggestedTransform,
  getMetabotSuggestedTransform,
} from "metabase-enterprise/metabot/state";
import { RunStatus } from "metabase-enterprise/transforms/components/RunStatus";
import { POLLING_INTERVAL } from "metabase-enterprise/transforms/constants";
import { UpdateTargetModal } from "metabase-enterprise/transforms/pages/TransformTargetPage/TargetSection/UpdateTargetModal";
import {
  isSameSource,
  isTransformCanceling,
  isTransformRunning,
  isTransformSyncing,
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

import { WorkspaceRunButton } from "../../components/WorkspaceRunButton/WorkspaceRunButton";

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
  const {
    updateTransformState,
    isWorkspaceExecuting,
    setIsWorkspaceExecuting,
  } = useWorkspace();
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

  const [isRunTriggered, setIsRunTriggered] = useState(false);
  const shouldPoll =
    isPollingNeeded(transform) || isRunTriggered || isWorkspaceExecuting;
  const {
    data: fetchedTransform,
    isLoading,
    isFetching,
  } = useGetTransformQuery(transform.id, {
    pollingInterval: shouldPoll ? POLLING_INTERVAL : undefined,
  });

  useEffect(() => {
    if (fetchedTransform && fetchedTransform.last_run !== transform.last_run) {
      updateTransformState(fetchedTransform);
    }

    // stop forced polling once we get updated data and transform is running
    if (
      isRunTriggered &&
      fetchedTransform &&
      isPollingNeeded(fetchedTransform)
    ) {
      setIsRunTriggered(false);
    }

    // stop workspace executing flag once transform finishes
    if (
      isWorkspaceExecuting &&
      fetchedTransform &&
      !isPollingNeeded(fetchedTransform)
    ) {
      setIsWorkspaceExecuting(false);
    }
  }, [
    fetchedTransform,
    transform.last_run,
    updateTransformState,
    isRunTriggered,
    isWorkspaceExecuting,
    setIsWorkspaceExecuting,
  ]);

  const run = fetchedTransform?.last_run ?? transform.last_run ?? null;
  const isRunStatusLoading = run == null && (isLoading || isFetching);

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
      setIsRunTriggered(true);
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
      setIsRunTriggered(false);
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
      updateTransformState(updatedTransform);
      sendSuccessToast(t`Transform target updated`);
      closeChangeTargetModal();
    },
    [closeChangeTargetModal, updateTransformState, sendSuccessToast],
  );

  const isRunning = isTransformRunning(transform);

  return (
    <Stack gap={0} h="100%">
      <Stack
        flex="0 0 auto"
        gap="sm"
        p="md"
        style={{ borderBottom: "1px solid var(--mb-color-border)" }}
      >
        <Group justify="space-between">
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
              <WorkspaceRunButton
                id={transform.id}
                run={transform.last_run}
                isDisabled={hasChanges}
                onRun={handleRun}
              />
            )}

            {isSaved && (
              <SaveTransformButton
                databaseId={databaseId}
                workspaceId={workspaceId}
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

        {isSaved &&
          (isRunStatusLoading ? (
            <Group gap="sm">
              <Icon c="text-secondary" name="sync" />
              <Box>{t`Loading run status...`}</Box>
            </Group>
          ) : (
            <RunStatus
              run={run}
              neverRunMessage={t`This transform hasn't been run before.`}
            />
          ))}
      </Stack>

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

function isPollingNeeded(transform: Transform) {
  return (
    isTransformRunning(transform) ||
    isTransformCanceling(transform) ||
    isTransformSyncing(transform)
  );
}
