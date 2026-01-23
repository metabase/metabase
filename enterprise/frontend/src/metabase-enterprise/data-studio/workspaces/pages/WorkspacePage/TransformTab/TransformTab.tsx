import { useDisclosure } from "@mantine/hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Button, Group, Icon, Stack } from "metabase/ui";
import { useWorkspaceTransformRun } from "metabase-enterprise/data-studio/workspaces/hooks";
import {
  deactivateSuggestedTransform,
  getMetabotSuggestedTransform,
} from "metabase-enterprise/metabot/state";
import { RunStatus } from "metabase-enterprise/transforms/components/RunStatus";
import {
  getInitialNativeSource,
  getInitialPythonSource,
} from "metabase-enterprise/transforms/pages/NewTransformPage/utils";
import { isSameSource } from "metabase-enterprise/transforms/utils";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type {
  DatabaseId,
  DatasetQuery,
  DraftTransformSource,
  TaggedTransform,
  WorkspaceId,
  WorkspaceTransform,
  WorkspaceTransformListItem,
} from "metabase-types/api";
import { isUnsavedTransform, isWorkspaceTransform } from "metabase-types/api";

import { WorkspaceRunButton } from "../../../components/WorkspaceRunButton/WorkspaceRunButton";
import { TransformEditor } from "../TransformEditor";
import type {
  AnyWorkspaceTransform,
  EditedTransform,
  TableTab,
} from "../WorkspaceProvider";
import {
  getNumericTransformId,
  getTransformId,
  useWorkspace,
} from "../WorkspaceProvider";

import { SaveTransformButton } from "./SaveTransformButton";
import { UpdateTargetModal } from "./UpdateTargetModal/UpdateTargetModal";

interface Props {
  databaseId: DatabaseId;
  transform: AnyWorkspaceTransform;
  workspaceId: WorkspaceId;
  workspaceTransforms: WorkspaceTransformListItem[];
  isDisabled: boolean;
  onSaveTransform: (transform: TaggedTransform | WorkspaceTransform) => void;
}

export function TransformTab({
  databaseId,
  transform,
  workspaceId,
  workspaceTransforms,
  isDisabled,
  onSaveTransform,
}: Props) {
  const {
    updateTransformState,
    addOpenedTab,
    editedTransforms,
    patchEditedTransform,
  } = useWorkspace();
  const { sendErrorToast } = useMetadataToasts();
  const [
    isChangeTargetModalOpen,
    { open: openChangeTargetModal, close: closeChangeTargetModal },
  ] = useDisclosure();
  const dispatch = useDispatch();
  const transformId = getTransformId(transform);
  const numericTransformId = getNumericTransformId(transform);
  const suggestedTransform = useSelector((state) =>
    getMetabotSuggestedTransform(state, numericTransformId),
  );
  const metadata = useSelector(getMetadata);

  // Local source state to prevent re-renders on every keystroke
  // This is the key optimization: we manage source locally and sync to provider
  const [localSource, setLocalSource] = useState<DraftTransformSource>(() => {
    const edited = editedTransforms.get(transformId);
    return edited?.source ?? transform.source;
  });

  // Track previous transform ID to detect when we switch transforms
  const prevTransformIdRef = useRef(transformId);

  // Reset local source when switching to a different transform
  useEffect(() => {
    if (prevTransformIdRef.current !== transformId) {
      const edited = editedTransforms.get(transformId);
      setLocalSource(edited?.source ?? transform.source);
      prevTransformIdRef.current = transformId;
    }
    // Note: editedTransforms is intentionally excluded from deps
    // We only want to sync when transform ID changes, not on every edit
  }, [transformId, transform.source, editedTransforms]);

  // Construct editedTransform from provider state (for save button)
  // Use providerEdited?.source for the latest source (updated via patchEditedTransform)
  // Fall back to localSource only for initial render before any edits
  const providerEdited = editedTransforms.get(transformId);
  const editedTransform: EditedTransform = {
    name: providerEdited?.name ?? transform.name,
    source: providerEdited?.source ?? localSource,
    target: providerEdited?.target ?? transform.target,
  };

  const wsTransform = isWorkspaceTransform(transform) ? transform : null;
  const currentSource = providerEdited?.source ?? localSource;
  const hasSourceChanged = !isSameSource(currentSource, transform.source);
  const hasTargetNameChanged =
    "target" in editedTransform &&
    "target" in transform &&
    transform.target.name !== editedTransform.target.name;
  const hasChanges = hasSourceChanged || hasTargetNameChanged;

  // Run transform hook - handles run state, API calls, and error handling
  const { statusRun, buttonRun, isRunStatusLoading, isRunning, handleRun } =
    useWorkspaceTransformRun({
      workspaceId,
      transform: wsTransform,
    });

  const handleRunQueryStart = useCallback(
    (query: DatasetQuery) => {
      // Preview doesn't have a real table ID, but we need to provide a unique identifier
      // to open preview tab correctly.
      const tableTabId = `table-${transformId}`;

      // Always use query preview when we have a query, regardless of whether the transform
      // is saved or not. The query represents the current state of the editor (which may
      // have unsaved changes), and we want to preview what the current query will produce.
      // The dry run API uses the saved transform's source, not the current query.
      const tableTab: TableTab = {
        id: tableTabId,
        name: t`Preview (${transform.name})`,
        type: "table",
        table: {
          tableId: null, // Always null for preview - use query instead
          name: t`Preview (${transform.name})`,
          query,
          transformId: undefined, // Always undefined - use query preview, not dry run
        },
      };
      addOpenedTab(tableTab);
      return false;
    },
    [transformId, transform.name, addOpenedTab],
  );

  const handleRunTransform = useCallback(
    (result: unknown) => {
      const tableTabId = `table-${transformId}`;

      const tableTab: TableTab = {
        id: tableTabId,
        name: t`Preview (${transform.name})`,
        type: "table",
        table: {
          tableId: null,
          name: t`Preview (${transform.name})`,
          transformId: String(transformId),
          pythonPreviewResult: result,
        },
      };

      addOpenedTab(tableTab);
    },
    [transformId, transform.name, addOpenedTab],
  );

  const normalizeSource = useCallback(
    (source: DraftTransformSource): DraftTransformSource => {
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
        type: "query" as const,
        query: question.setQuery(normalizedQuery).datasetQuery(),
      };
    },
    [metadata],
  );

  // Show proposed source when there's an active suggested transform
  // Even if sources are the same (e.g., when transform was created with suggested source),
  // we still want to show the buttons so user can reject the suggestion
  const proposedSource: DraftTransformSource | undefined =
    suggestedTransform?.source
      ? normalizeSource(suggestedTransform.source)
      : undefined;

  const isSaved =
    isWorkspaceTransform(transform) &&
    workspaceTransforms.some((t) => t.ref_id === transform.ref_id);
  const isEditable = !isDisabled;

  const handleSourceChange = useCallback(
    (source: DraftTransformSource) => {
      setLocalSource(source);
      patchEditedTransform(transformId, { source });
    },
    [transformId, patchEditedTransform],
  );

  const handleMetabotAcceptProposed = useCallback(() => {
    if (proposedSource == null) {
      return;
    }

    // Allow applying suggestions to both saved workspace transforms and unsaved transforms
    // Only block if it's a tagged transform (external transform) that hasn't been checked out
    const isUnsaved = isUnsavedTransform(transform);
    if (!isSaved && !isUnsaved) {
      sendErrorToast(
        t`Add this transform to the workspace before applying Metabot changes.`,
      );
      return;
    }

    // When accepting, we DO need to update localSource to reset the editor
    setLocalSource(proposedSource);
    patchEditedTransform(transformId, { source: proposedSource });
    dispatch(deactivateSuggestedTransform(suggestedTransform?.id));
  }, [
    proposedSource,
    dispatch,
    suggestedTransform?.id,
    isSaved,
    transform,
    sendErrorToast,
    transformId,
    patchEditedTransform,
  ]);

  const handleMetabotRejectProposed = useCallback(() => {
    if (suggestedTransform) {
      dispatch(deactivateSuggestedTransform(suggestedTransform.id));

      // For unsaved transforms, clear the source back to empty state when rejecting
      if (isUnsavedTransform(transform)) {
        const emptySource = createEmptySourceForType(currentSource);
        if (emptySource) {
          // When rejecting, we DO need to update localSource to reset the editor
          setLocalSource(emptySource);
          patchEditedTransform(transformId, { source: emptySource });
        }
      }
    }
  }, [
    dispatch,
    suggestedTransform,
    transform,
    currentSource,
    transformId,
    patchEditedTransform,
  ]);

  const handleTargetUpdate = useCallback(
    (updatedTransform?: WorkspaceTransform) => {
      if (updatedTransform) {
        updateTransformState(updatedTransform);
      }
      closeChangeTargetModal();
    },
    [updateTransformState, closeChangeTargetModal],
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
                id={numericTransformId}
                run={buttonRun}
                isDisabled={hasChanges || isDisabled}
                onRun={handleRun}
              />
            )}

            <SaveTransformButton
              databaseId={databaseId}
              workspaceId={workspaceId}
              editedTransform={editedTransform}
              transform={transform}
              workspaceTransforms={workspaceTransforms}
              isDisabled={isDisabled}
              onSaveTransform={onSaveTransform}
              hasChanges={hasChanges}
            />
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
            source={localSource}
            proposedSource={proposedSource}
            onAcceptProposed={handleMetabotAcceptProposed}
            onRejectProposed={handleMetabotRejectProposed}
            onChange={handleSourceChange}
            onRunQueryStart={handleRunQueryStart}
            onRunTransform={handleRunTransform}
          />
        </Box>
      )}

      {isChangeTargetModalOpen && wsTransform && (
        <UpdateTargetModal
          transform={wsTransform}
          onUpdate={handleTargetUpdate}
          onClose={closeChangeTargetModal}
        />
      )}
    </Stack>
  );
}

/**
 * Creates an empty source based on the type of the current source.
 * Used when rejecting a metabot suggestion on an unsaved transform.
 */
function createEmptySourceForType(
  currentSource: DraftTransformSource,
): DraftTransformSource | null {
  if (currentSource.type === "query") {
    const emptySource = getInitialNativeSource();
    // Preserve the database ID from the current source
    const databaseId =
      "database" in currentSource.query ? currentSource.query.database : null;
    if (databaseId) {
      return {
        ...emptySource,
        query: { ...emptySource.query, database: databaseId },
      };
    }
    return emptySource;
  }

  if (currentSource.type === "python") {
    const emptySource = getInitialPythonSource();
    // Preserve the database ID from the current source
    return {
      ...emptySource,
      "source-database": currentSource["source-database"],
    };
  }

  return null;
}
