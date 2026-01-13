import { useDisclosure } from "@mantine/hooks";
import { useCallback } from "react";
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
import { isSameSource } from "metabase-enterprise/transforms/utils";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type {
  DatabaseId,
  DatasetQuery,
  DraftTransformSource,
  Transform,
  WorkspaceId,
  WorkspaceTransform,
  WorkspaceTransformItem,
} from "metabase-types/api";

import { WorkspaceRunButton } from "../../../components/WorkspaceRunButton/WorkspaceRunButton";
import { TransformEditor } from "../TransformEditor";
import type { EditedTransform, TableTab } from "../WorkspaceProvider";
import { useWorkspace } from "../WorkspaceProvider";

import { SaveTransformButton } from "./SaveTransformButton";
import { UpdateTargetModal } from "./UpdateTargetModal/UpdateTargetModal";

interface Props {
  databaseId: DatabaseId;
  editedTransform: EditedTransform;
  transform: Transform | WorkspaceTransform;
  workspaceId: WorkspaceId;
  workspaceTransforms: WorkspaceTransformItem[];
  isDisabled: boolean;
  onChange: (patch: Partial<EditedTransform>) => void;
  onSaveTransform: (transform: Transform | WorkspaceTransform) => void;
}

export const TransformTab = ({
  databaseId,
  editedTransform,
  transform,
  workspaceId,
  workspaceTransforms,
  isDisabled,
  onChange,
  onSaveTransform,
}: Props) => {
  const { updateTransformState, addOpenedTab } = useWorkspace();
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

  const handleRunTransform = useCallback(
    (result) => {
      const tableTabId = `table-${transform.id}`;

      const tableTab: TableTab = {
        id: tableTabId,
        name: t`Preview (${transform.name})`,
        type: "table",
        table: {
          tableId: transform.id,
          name: t`Preview (${transform.name})`,
          transformId: transform.id.toString(),
          pythonPreviewResult: result,
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

            <SaveTransformButton
              databaseId={databaseId}
              workspaceId={workspaceId}
              editedTransform={editedTransform}
              transform={transform}
              workspaceTransforms={workspaceTransforms}
              isDisabled={isDisabled}
              onSaveTransform={onSaveTransform}
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
            source={editedTransform.source}
            proposedSource={proposedSource}
            onAcceptProposed={handleAcceptProposed}
            onRejectProposed={handleRejectProposed}
            onChange={handleSourceChange}
            onRunQueryStart={handleRunQueryStart}
            onRunTransform={handleRunTransform}
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
    </Stack>
  );
};
