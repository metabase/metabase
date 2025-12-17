import { useDisclosure } from "@mantine/hooks";
import { skipToken } from "@reduxjs/toolkit/query";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { useListDatabaseSchemasQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import Link from "metabase/common/components/Link";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Button, Group, Icon, Stack, Text } from "metabase/ui";
import {
  useCreateWorkspaceTransformMutation,
  useValidateTableNameMutation,
  workspaceApi,
} from "metabase-enterprise/api";
import { tag } from "metabase-enterprise/api/tags";
import { useWorkspaceTransformRun } from "metabase-enterprise/data-studio/workspaces/hooks";
import {
  deactivateSuggestedTransform,
  getMetabotSuggestedTransform,
} from "metabase-enterprise/metabot/state";
import { RunStatus } from "metabase-enterprise/transforms/components/RunStatus";
import {
  CreateTransformModal,
  type NewTransformValues,
} from "metabase-enterprise/transforms/pages/NewTransformPage/CreateTransformModal/CreateTransformModal";
import { isSameSource } from "metabase-enterprise/transforms/utils";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type {
  CreateWorkspaceTransformRequest,
  DatabaseId,
  DraftTransformSource,
  Transform,
  TransformTarget,
  WorkspaceId,
  WorkspaceTransform,
  WorkspaceTransformItem,
} from "metabase-types/api";

import { WorkspaceRunButton } from "../../../components/WorkspaceRunButton/WorkspaceRunButton";
import { SaveTransformButton } from "../SaveTransformButton";
import { TransformEditor } from "../TransformEditor";
import type { EditedTransform } from "../WorkspaceProvider";
import { useWorkspace } from "../WorkspaceProvider";

import { UpdateTargetModal } from "./UpdateTargetModal/UpdateTargetModal";

interface Props {
  databaseId: DatabaseId;
  editedTransform: EditedTransform;
  transform: Transform | WorkspaceTransform;
  workspaceId: WorkspaceId;
  workspaceTransforms: WorkspaceTransformItem[];
  isArchived: boolean;
  onChange: (patch: Partial<EditedTransform>) => void;
  onOpenTransform: (transformId: number | string) => void;
}

export const TransformTab = ({
  databaseId,
  editedTransform,
  transform,
  workspaceId,
  workspaceTransforms,
  isArchived,
  onChange,
  onOpenTransform,
}: Props) => {
  const {
    updateTransformState,
    setActiveTransform,
    removeUnsavedTransform,
    removeOpenedTransform,
    removeEditedTransform,
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

  // Cast to WorkspaceTransform since we're in workspace context
  const wsTransform = transform as WorkspaceTransform;

  // Run transform hook - handles run state, API calls, and error handling
  const {
    statusRun,
    buttonRun,
    isRunStatusLoading,
    isRunning,
    handleRun,
    output,
  } = useWorkspaceTransformRun({
    workspaceId,
    transform: wsTransform,
  });

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

  const isSaved = workspaceTransforms.some(
    (t) => "ref_id" in transform && t.ref_id === transform.ref_id,
  );
  const isEditable = !isArchived;

  const [createWorkspaceTransform] = useCreateWorkspaceTransformMutation();
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
              source: editedTransform.source,
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
              source: editedTransform.source,
              target: {
                type: "table" as const,
                name: values.targetName,
                schema: values.targetSchema,
                database: databaseId,
              },
            };

      const savedTransform = await createWorkspaceTransform(request).unwrap();

      // Remove from unsaved transforms and refresh workspace
      if ("id" in editedTransform && typeof editedTransform.id === "number") {
        removeUnsavedTransform(editedTransform.id);
      }

      // Invalidate workspace transforms after creating new one
      dispatch(
        workspaceApi.util.invalidateTags([
          tag("workspace-transforms", workspaceId),
        ]),
      );

      // Open the newly saved transform
      setActiveTransform(savedTransform);
      onOpenTransform(savedTransform.id);

      sendSuccessToast(t`Transform saved successfully`);
      setSaveModalOpen(false);

      return savedTransform;
    } catch (error) {
      sendErrorToast(t`Failed to save transform`);
      throw error;
    }
  };

  const handleSaveExternalTransform = async () => {
    // Only applicable for global transforms (numeric IDs) that are not yet
    // saved into the workspace.
    if (typeof transform.id !== "number") {
      return;
    }

    const savedTransform = await createWorkspaceTransform({
      id: workspaceId,
      global_id: transform.id,
      name: editedTransform.name,
      description: transform.description,
      // Cast to TransformSource to satisfy the createWorkspaceTransform request.
      source: editedTransform.source as DraftTransformSource,
      target: transform.target,
      tag_ids: transform.tag_ids,
    }).unwrap();

    removeEditedTransform(transform.id);
    removeOpenedTransform(transform.id);
    setActiveTransform(savedTransform);
    onOpenTransform(savedTransform.id);
  };

  const validationSchemaExtension = useTransformValidation({
    databaseId,
    target: transform.target,
    workspaceId,
  });
  const initialCreateTransformValues = useMemo(
    () => ({
      name: transform.name,
    }),
    [transform.name],
  );

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
    (updatedTransform?: WorkspaceTransform) => {
      if (updatedTransform) {
        updateTransformState(updatedTransform);
        sendSuccessToast(t`Transform target updated`);
      }
      closeChangeTargetModal();
    },
    [updateTransformState, sendSuccessToast, closeChangeTargetModal],
  );

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
                disabled={isRunning || hasChanges || isArchived}
                onClick={openChangeTargetModal}
              >{t`Change target`}</Button>
            )}
          </Group>

          <Group>
            <Group gap="sm">
              {isSaved && (
                <WorkspaceRunButton
                  id={transform.id}
                  run={buttonRun}
                  isDisabled={hasChanges || isArchived}
                  onRun={handleRun}
                />
              )}
              {output && (
                <Link
                  target="_blank"
                  rel="noreferrer"
                  tooltip={t`View transform output`}
                  to={Urls.queryBuilderTable(output.table_id, output.db_id)}
                >
                  <Text c="brand">{t`[results]`}</Text>
                </Link>
              )}
            </Group>

            {isSaved && (
              <SaveTransformButton
                databaseId={databaseId}
                workspaceId={workspaceId}
                editedTransform={editedTransform}
                transform={transform}
                isArchived={isArchived}
              />
            )}

            {!isSaved && transform.id < 0 && (
              <Button
                leftSection={<Icon name="check" />}
                size="sm"
                disabled={isArchived}
                onClick={() => setSaveModalOpen(true)}
              >{t`Save`}</Button>
            )}

            {!isSaved && transform.id >= 0 && hasChanges && (
              <Button
                leftSection={<Icon name="check" />}
                size="sm"
                variant="filled"
                disabled={isArchived}
                onClick={handleSaveExternalTransform}
              >{t`Save`}</Button>
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
              run={statusRun}
              neverRunMessage={t`This transform hasn't been run before.`}
            />
          ))}
      </Stack>

      {editedTransform && (
        <Box flex="1">
          <TransformEditor
            disabled={!isEditable}
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
          transform={transform as WorkspaceTransform}
          onUpdate={handleTargetUpdate}
          onClose={closeChangeTargetModal}
        />
      )}
      {saveModalOpen && (
        <CreateTransformModal
          source={editedTransform.source}
          defaultValues={initialCreateTransformValues}
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
