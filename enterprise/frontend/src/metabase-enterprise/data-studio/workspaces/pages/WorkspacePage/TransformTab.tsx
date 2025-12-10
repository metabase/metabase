import { useDisclosure } from "@mantine/hooks";
import { skipToken } from "@reduxjs/toolkit/query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { useListDatabaseSchemasQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Button, Group, Icon, Stack } from "metabase/ui";
import {
  useCreateWorkspaceTransformMutation,
  useGetTransformQuery,
  useRunTransformMutation,
  useValidateTableNameMutation,
  workspaceApi,
} from "metabase-enterprise/api";
import { tag } from "metabase-enterprise/api/tags";
import {
  deactivateSuggestedTransform,
  getMetabotSuggestedTransform,
} from "metabase-enterprise/metabot/state";
import { RunStatus } from "metabase-enterprise/transforms/components/RunStatus";
import { POLLING_INTERVAL } from "metabase-enterprise/transforms/constants";
import {
  CreateTransformModal,
  type NewTransformValues,
} from "metabase-enterprise/transforms/pages/NewTransformPage/CreateTransformModal/CreateTransformModal";
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
  CreateWorkspaceTransformRequest,
  DatabaseId,
  DraftTransformSource,
  Transform,
  TransformId,
  TransformTarget,
  WorkspaceId,
} from "metabase-types/api";
import type { EditedTransform } from "./WorkspaceProvider";

import { WorkspaceRunButton } from "../../components/WorkspaceRunButton/WorkspaceRunButton";

import { CheckOutTransformButton } from "./CheckOutTransformButton";
import { SaveTransformButton } from "./SaveTransformButton";
import { TransformEditor } from "./TransformEditor";
import { useWorkspace } from "./WorkspaceProvider";

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
    removeUnsavedTransform,
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
    skip: transform.id < 0,
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

  const [createWorkspaceTransform] = useCreateWorkspaceTransformMutation();
  const [runTransform] = useRunTransformMutation();
  const [_validateTableName] = useValidateTableNameMutation();
  const [saveModalOpen, setSaveModalOpen] = useState(false);

  const { data: fetchedSchemas = [] } = useListDatabaseSchemasQuery(
    databaseId ? { id: databaseId, include_hidden: false } : skipToken,
  );
  const allowedSchemas = useMemo(
    () =>
      fetchedSchemas.filter((schema) => !schema.startsWith("mb__isolation")),
    [fetchedSchemas],
  );

  const handleSave = async (values: NewTransformValues): Promise<Transform> => {
    try {
      const request: CreateWorkspaceTransformRequest & { id: WorkspaceId } =
        values.incremental
          ? {
              id: workspaceId,
              name: values.name,
              description: null,
              source: transform.source,
              target: {
                type: "table-incremental" as const,
                name: values.targetName,
                schema: values.targetSchema,
                database: databaseId,
                "target-incremental-strategy": {
                  type: "append" as const,
                },
              },
            }
          : {
              id: workspaceId,
              name: values.name,
              description: null,
              source: transform.source,
              target: {
                type: "table" as const,
                name: values.targetName,
                schema: values.targetSchema,
                database: databaseId,
              },
            };

      const savedTransform = await createWorkspaceTransform(request).unwrap();

      // Remove from unsaved transforms and refresh workspace
      removeUnsavedTransform(transform.id);

      // Invalidate workspace transforms after creating new one
      dispatch(
        workspaceApi.util.invalidateTags([
          tag("workspace-transforms", workspaceId),
        ]),
      );

      // Open the newly saved transform
      onOpenTransform(savedTransform.id);

      sendSuccessToast(t`Transform saved successfully`);
      setSaveModalOpen(false);

      return savedTransform;
    } catch (error) {
      sendErrorToast(t`Failed to save transform`);
      throw error;
    }
  };

  const validationSchemaExtension = useTransformValidation({
    databaseId,
    target: transform.target,
    workspaceId,
  });

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
    (updatedTransform?: Transform) => {
      if (updatedTransform) {
        updateTransformState(updatedTransform);
        sendSuccessToast(t`Transform target updated`);
      }
      closeChangeTargetModal();
    },
    [updateTransformState, sendSuccessToast, closeChangeTargetModal],
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

            {!isSaved && transform.id < 0 && (
              <Button
                leftSection={<Icon name="check" />}
                size="sm"
                onClick={() => setSaveModalOpen(true)}
              >{t`Save`}</Button>
            )}

            {!isSaved && transform.id >= 0 && (
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
      {saveModalOpen && (
        <CreateTransformModal
          source={editedTransform.source}
          defaultValues={{ name: transform.name }}
          onClose={() => setSaveModalOpen(false)}
          schemas={allowedSchemas}
          showIncrementalSettings={true}
          validationSchemaExtension={validationSchemaExtension}
          handleSubmit={handleSave}
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

export const useTransformValidation = ({
  databaseId,
  target,
  workspaceId,
}: {
  databaseId: DatabaseId;
  target?: TransformTarget;
  workspaceId: WorkspaceId;
}) => {
  const [validateTableName] = useValidateTableNameMutation();

  const yupSchema = useMemo(
    () => ({
      targetName: Yup.string()
        .required("Target table name is required")
        .test(async (value, context) => {
          if (!value) {
            return context.createError({
              message: "Target table name is required",
            });
          }

          const schema = context.parent.targetSchema;

          if (target && target.name === value && target.schema === schema) {
            return true;
          }

          try {
            const message = await validateTableName({
              id: workspaceId,
              db_id: databaseId,
              target: { type: "table", name: value, schema },
            }).unwrap();

            return message === "OK" ? true : context.createError({ message });
          } catch (error) {
            const message = getErrorMessage(error);
            return context.createError({ message });
          }
        }),
    }),
    [databaseId, target, workspaceId, validateTableName],
  );

  return yupSchema;
};
