import { useDisclosure } from "@mantine/hooks";
import { skipToken } from "@reduxjs/toolkit/query";
import { useCallback, useMemo, useRef, useState } from "react";
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
  useValidateTableNameMutation,
  workspaceApi,
} from "metabase-enterprise/api";
import { idTag, listTag } from "metabase-enterprise/api/tags";
import { useWorkspaceTransformRun } from "metabase-enterprise/data-studio/workspaces/hooks";
import {
  deactivateSuggestedTransform,
  getMetabotSuggestedTransform,
} from "metabase-enterprise/metabot/state";
import { RunStatus } from "metabase-enterprise/transforms/components/RunStatus";
import { CreateTransformModal } from "metabase-enterprise/transforms/pages/NewTransformPage/CreateTransformModal/CreateTransformModal";
import type { NewTransformValues } from "metabase-enterprise/transforms/pages/NewTransformPage/CreateTransformModal/form";
import { isSameSource } from "metabase-enterprise/transforms/utils";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type {
  CreateWorkspaceTransformRequest,
  DatabaseId,
  DatasetQuery,
  DraftTransformSource,
  ExternalTransform,
  Transform,
  TransformTarget,
  WorkspaceId,
  WorkspaceTransform,
  WorkspaceTransformItem,
} from "metabase-types/api";

import { WorkspaceRunButton } from "../../../components/WorkspaceRunButton/WorkspaceRunButton";
import { SaveTransformButton } from "../SaveTransformButton";
import { TransformEditor } from "../TransformEditor";
import type { EditedTransform, TableTab } from "../WorkspaceProvider";
import { useWorkspace } from "../WorkspaceProvider";

import { UpdateTargetModal } from "./UpdateTargetModal/UpdateTargetModal";

interface Props {
  databaseId: DatabaseId;
  editedTransform: EditedTransform;
  transform: Transform | WorkspaceTransform;
  workspaceId: WorkspaceId;
  workspaceTransforms: WorkspaceTransformItem[];
  isDisabled: boolean;
  onChange: (patch: Partial<EditedTransform>) => void;
  onOpenTransform: (transform: Transform | WorkspaceTransform) => void;
}

export const TransformTab = ({
  databaseId,
  editedTransform,
  transform,
  workspaceId,
  workspaceTransforms,
  isDisabled,
  onChange,
  onOpenTransform,
}: Props) => {
  const {
    updateTransformState,
    removeUnsavedTransform,
    removeOpenedTransform,
    removeEditedTransform,
    addOpenedTab,
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
  const { statusRun, buttonRun, isRunStatusLoading, isRunning, handleRun } =
    useWorkspaceTransformRun({
      workspaceId,
      transform: wsTransform,
    });

  const handleRunQueryStart = useCallback(
    async (query: DatasetQuery) => {
      const tableTabId = `table-${transform.id}`;

      const tableTab: TableTab = {
        id: tableTabId,
        name: t`Preview (${transform.name})`,
        type: "table",
        table: {
          tableId: transform.id,
          name: t`Preview (${transform.name})`,
          query,
        },
      };
      addOpenedTab(tableTab);
    },
    [transform.id, transform.name, addOpenedTab],
  );

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
  const isEditable = !isDisabled;

  const isCheckoutDisabled =
    isExternalTransform(transform) &&
    typeof transform.checkout_disabled === "string";

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
          idTag("workspace-transforms", workspaceId),
          listTag("external-transform"),
        ]),
      );

      // Open the newly saved transform
      onOpenTransform(savedTransform);

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
    onOpenTransform(savedTransform);
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
        data-testid="transform-tab-header"
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
                disabled={isRunning || hasChanges || isDisabled}
                onClick={openChangeTargetModal}
              >{t`Change target`}</Button>
            )}
          </Group>

          <Group>
            {isSaved && (
              <WorkspaceRunButton
                id={transform.id}
                run={buttonRun}
                isDisabled={hasChanges || isDisabled}
                onRun={handleRun}
              />
            )}

            {isSaved && (
              <SaveTransformButton
                databaseId={databaseId}
                workspaceId={workspaceId}
                editedTransform={editedTransform}
                transform={transform}
                isArchived={isDisabled}
              />
            )}

            {!isSaved && transform.id < 0 && (
              <Button
                leftSection={<Icon name="check" />}
                size="sm"
                variant="filled"
                disabled={isDisabled || !hasChanges}
                onClick={() => setSaveModalOpen(true)}
              >{t`Save`}</Button>
            )}

            {!isSaved && transform.id >= 0 && (
              <Button
                leftSection={<Icon name="check" />}
                size="sm"
                variant={hasChanges ? "filled" : "default"}
                disabled={isDisabled || isCheckoutDisabled || !hasChanges}
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
        <Box
          flex="1 1 auto"
          style={{ overflow: "auto", "--native-query-editor-flex": "1 1 auto" }}
        >
          <TransformEditor
            disabled={!isEditable}
            source={editedTransform.source}
            proposedSource={proposedSource}
            onAcceptProposed={handleAcceptProposed}
            onRejectProposed={handleRejectProposed}
            onChange={handleSourceChange}
            onRunQueryStart={handleRunQueryStart}
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
          validateOnMount
          handleSubmit={handleSave}
          targetDescription={t`This is the main table this transform owns. Runs from this workspace write to an isolated workspace copy, so the original table isn't changed until you merge the workspace.`}
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

  const validateTableNameDebounceRef = useRef<{
    timeoutId?: ReturnType<typeof setTimeout>;
    pending?: { resolve: (message: string) => void };
  }>({});

  // I wasn't able to simplify this logic any further, but maybe a review would be nice.
  // We wrap debounced validation call in a promise to properly set form state,
  // and we need to handle pending state to prevent multiple validation calls.
  const debouncedValidateTableName = useCallback(
    ({ name, schema }: { name: string; schema?: string }) => {
      const debounceState = validateTableNameDebounceRef.current;

      if (debounceState.timeoutId) {
        clearTimeout(debounceState.timeoutId);
      }

      debounceState.pending?.resolve("OK");
      debounceState.pending = undefined;

      return new Promise<string>((resolve) => {
        const pending = { resolve };
        debounceState.pending = pending;

        debounceState.timeoutId = setTimeout(async () => {
          debounceState.timeoutId = undefined;

          let message: string;
          try {
            message = await validateTableName({
              id: workspaceId,
              db_id: databaseId,
              target: { type: "table", name, schema: schema ?? null },
            }).unwrap();
          } catch (error) {
            message = getErrorMessage(error);
          }

          if (debounceState.pending === pending) {
            debounceState.pending = undefined;
            resolve(message);
          }
        }, 300);
      });
    },
    [databaseId, validateTableName, workspaceId],
  );

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

          const message = await debouncedValidateTableName({
            name: value,
            schema,
          });

          return message === "OK" ? true : context.createError({ message });
        }),
    }),
    [debouncedValidateTableName, target],
  );

  return yupSchema;
};

function isExternalTransform(
  transform: Transform | ExternalTransform | WorkspaceTransform,
): transform is ExternalTransform {
  return "checkout_disabled" in transform;
}
