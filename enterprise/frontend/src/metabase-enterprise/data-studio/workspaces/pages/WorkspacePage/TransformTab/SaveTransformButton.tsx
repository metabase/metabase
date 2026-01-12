import { skipToken } from "@reduxjs/toolkit/query";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { useListDatabaseSchemasQuery } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button } from "metabase/ui";
import {
  useCreateWorkspaceTransformMutation,
  useUpdateWorkspaceTransformMutation,
  workspaceApi,
} from "metabase-enterprise/api";
import { idTag, listTag } from "metabase-enterprise/api/tags";
import { CreateTransformModal } from "metabase-enterprise/transforms/pages/NewTransformPage/CreateTransformModal/CreateTransformModal";
import type { NewTransformValues } from "metabase-enterprise/transforms/pages/NewTransformPage/CreateTransformModal/form";
import { isSameSource } from "metabase-enterprise/transforms/utils";
import type {
  CreateWorkspaceTransformRequest,
  DatabaseId,
  DraftTransformSource,
  ExternalTransform,
  Transform,
  WorkspaceId,
  WorkspaceTransform,
  WorkspaceTransformItem,
} from "metabase-types/api";

import type { EditedTransform } from "../WorkspaceProvider";
import { useWorkspace } from "../WorkspaceProvider";

import { useTransformValidation } from "./useTransformValidation";

type SaveTransformButtonProps = {
  databaseId: DatabaseId;
  editedTransform: EditedTransform;
  transform: Transform | WorkspaceTransform;
  workspaceId: WorkspaceId;
  workspaceTransforms: WorkspaceTransformItem[];
  isDisabled: boolean;
  onSaveTransform: (transform: Transform | WorkspaceTransform) => void;
};

export const SaveTransformButton = ({
  databaseId,
  editedTransform,
  transform,
  workspaceId,
  workspaceTransforms,
  isDisabled,
  onSaveTransform,
}: SaveTransformButtonProps) => {
  const dispatch = useDispatch();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const {
    updateTransformState,
    removeUnsavedTransform,
    removeWorkspaceTransform,
    removeEditedTransform,
  } = useWorkspace();

  const [updateTransform] = useUpdateWorkspaceTransformMutation();
  const [createWorkspaceTransform] = useCreateWorkspaceTransformMutation();
  const [saveModalOpen, setSaveModalOpen] = useState(false);

  // Determine transform state
  const isSaved = workspaceTransforms.some(
    (t) => "ref_id" in transform && t.ref_id === transform.ref_id,
  );
  const isNewTransform =
    !isSaved && typeof transform.id === "number" && transform.id < 0;
  const isCheckoutDisabled =
    isExternalTransform(transform) &&
    typeof transform.checkout_disabled === "string";

  // Check for changes
  const hasSourceChanged = !isSameSource(
    editedTransform.source,
    transform.source,
  );
  const hasTargetNameChanged =
    "target" in editedTransform &&
    "target" in transform &&
    transform.target.name !== editedTransform.target.name;
  const hasChanges = hasSourceChanged || hasTargetNameChanged;

  // Fetch schemas for CreateTransformModal
  const { data: fetchedSchemas = [] } = useListDatabaseSchemasQuery(
    databaseId && isNewTransform
      ? { id: databaseId, include_hidden: false }
      : skipToken,
  );
  const allowedSchemas = useMemo(
    () =>
      fetchedSchemas.filter((schema) => !schema.startsWith("mb__isolation")),
    [fetchedSchemas],
  );

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

  // Handler for updating existing workspace transform (scenario 1)
  const handleUpdateTransform = async () => {
    if (typeof transform.id !== "string") {
      throw new Error(t`This is not a workspace transform`);
    }

    const updated = await updateTransform({
      workspaceId,
      transformId: transform.id,
      source: editedTransform.source,
      name: editedTransform.name,
      target: {
        type: "table",
        name:
          "target" in editedTransform
            ? editedTransform.target.name
            : transform.target.name,
        schema: transform.target.schema,
        database: databaseId,
      },
    }).unwrap();

    updateTransformState(updated);
  };

  // Handler for creating new transform via modal (scenario 2)
  const handleCreateNewTransform = async (
    values: NewTransformValues,
  ): Promise<Transform> => {
    try {
      const request: CreateWorkspaceTransformRequest = values.incremental
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

      onSaveTransform(savedTransform);

      sendSuccessToast(t`Transform saved successfully`);
      setSaveModalOpen(false);

      return savedTransform;
    } catch (error) {
      sendErrorToast(t`Failed to save transform`);
      throw error;
    }
  };

  // Handler for checking out external transform (scenario 3)
  const handleSaveExternalTransform = async () => {
    if (typeof transform.id !== "number") {
      return;
    }

    try {
      const savedTransform = await createWorkspaceTransform({
        id: workspaceId,
        global_id: transform.id,
        name: editedTransform.name,
        description: transform.description,
        source: editedTransform.source as DraftTransformSource,
        target: transform.target,
        tag_ids: transform.tag_ids,
      }).unwrap();

      removeEditedTransform(transform.id);
      removeWorkspaceTransform(transform.id);
      onSaveTransform(savedTransform);
    } catch (error) {
      sendErrorToast(t`Failed to save transform`);
    }
  };

  // Determine button props based on scenario
  const getButtonProps = () => {
    if (isSaved) {
      return {
        disabled: !hasChanges || isDisabled,
        variant: "filled" as const,
        onClick: handleUpdateTransform,
      };
    }

    if (isNewTransform) {
      return {
        disabled: isDisabled || !hasChanges,
        variant: "filled" as const,
        onClick: () => setSaveModalOpen(true),
      };
    }

    // External transform
    return {
      disabled: isDisabled || isCheckoutDisabled,
      variant: (hasChanges ? "filled" : "default") as "filled" | "default",
      onClick: handleSaveExternalTransform,
    };
  };

  const buttonProps = getButtonProps();

  return (
    <>
      <Button size="sm" {...buttonProps}>{t`Save`}</Button>

      {saveModalOpen && (
        <CreateTransformModal
          source={editedTransform.source}
          defaultValues={initialCreateTransformValues}
          onClose={() => setSaveModalOpen(false)}
          schemas={allowedSchemas}
          showIncrementalSettings={true}
          validationSchemaExtension={validationSchemaExtension}
          validateOnMount
          handleSubmit={handleCreateNewTransform}
          targetDescription={t`This is the main table this transform owns. Runs from this workspace write to an isolated workspace copy, so the original table isn't changed until you merge the workspace.`}
        />
      )}
    </>
  );
};

function isExternalTransform(
  transform: Transform | ExternalTransform | WorkspaceTransform,
): transform is ExternalTransform {
  return "checkout_disabled" in transform;
}
