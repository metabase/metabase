import { useMemo, useState } from "react";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { getMetadata } from "metabase/selectors/metadata";
import { Button } from "metabase/ui";
import {
  useCreateWorkspaceTransformMutation,
  useUpdateWorkspaceTransformMutation,
  workspaceApi,
} from "metabase-enterprise/api";
import { idTag, listTag } from "metabase-enterprise/api/tags";
import { CreateTransformModal } from "metabase-enterprise/transforms/pages/NewTransformPage/CreateTransformModal/CreateTransformModal";
import type { NewTransformValues } from "metabase-enterprise/transforms/pages/NewTransformPage/CreateTransformModal/form";
import { isSourceEmpty } from "metabase-enterprise/transforms/utils";
import type {
  CreateWorkspaceTransformRequest,
  DatabaseId,
  SchemaName,
  TaggedTransform,
  TransformSource,
  WorkspaceId,
  WorkspaceTransform,
  WorkspaceTransformListItem,
} from "metabase-types/api";
import {
  isTaggedTransform,
  isUnsavedTransform,
  isWorkspaceTransform,
} from "metabase-types/api";

import type { AnyWorkspaceTransform } from "../WorkspaceProvider";
import { useWorkspace } from "../WorkspaceProvider";

import { useEditedTransform } from "./useEditedTransform";
import { useTransformValidation } from "./useTransformValidation";

const schemasFilter = (schema: SchemaName) =>
  !schema.startsWith("mb__isolation");

type SaveTransformButtonProps = {
  databaseId: DatabaseId;
  workspaceId: WorkspaceId;
  workspaceTransforms: WorkspaceTransformListItem[];
  transform: AnyWorkspaceTransform;
  isDisabled: boolean;
  onSaveTransform: (transform: TaggedTransform | WorkspaceTransform) => void;
};

export const SaveTransformButton = ({
  databaseId,
  workspaceId,
  workspaceTransforms,
  transform,
  isDisabled,
  onSaveTransform,
}: SaveTransformButtonProps) => {
  const dispatch = useDispatch();
  const metadata = useSelector(getMetadata);
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const {
    updateTransformState,
    removeUnsavedTransform,
    removeWorkspaceTransform,
    removeEditedTransform,
  } = useWorkspace();

  const [updateTransformMutation, { isLoading: isUpdating }] =
    useUpdateWorkspaceTransformMutation();
  const [createWorkspaceTransform] = useCreateWorkspaceTransformMutation();
  const [saveModalOpen, setSaveModalOpen] = useState(false);

  const { editedTransform, hasChanges } = useEditedTransform(transform);

  // Determine transform state
  const isSaved =
    isWorkspaceTransform(transform) &&
    workspaceTransforms.some((t) => t.ref_id === transform.ref_id);
  const isNewTransform = isUnsavedTransform(transform);

  const validationSchemaExtension = useTransformValidation({
    databaseId,
    target: isUnsavedTransform(transform) ? undefined : transform.target,
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
    if (!isWorkspaceTransform(transform)) {
      throw new Error(t`This is not a workspace transform`);
    }

    try {
      const updated = await updateTransformMutation({
        workspaceId,
        transformId: transform.ref_id,
        source: editedTransform.source as TransformSource,
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
    } catch (error) {
      sendErrorToast(t`Failed to save transform`);
    }
  };

  // Handler for creating new transform via modal (scenario 2)
  const handleCreateNewTransform = async (
    values: NewTransformValues,
  ): Promise<WorkspaceTransform> => {
    try {
      const request: CreateWorkspaceTransformRequest = values.incremental
        ? {
            id: workspaceId,
            name: values.name,
            description: null,
            source: editedTransform.source as TransformSource,
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
            source: editedTransform.source as TransformSource,
            target: {
              type: "table" as const,
              name: values.targetName,
              schema: values.targetSchema,
              database: databaseId,
            },
          };

      const savedTransform = await createWorkspaceTransform(request).unwrap();

      // Remove from unsaved transforms and refresh workspace
      if (isNewTransform) {
        removeUnsavedTransform(transform.id);
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
    if (!isTaggedTransform(transform)) {
      return;
    }

    try {
      const savedTransform = await createWorkspaceTransform({
        id: workspaceId,
        global_id: transform.id,
        name: editedTransform.name,
        description: transform.description,
        source: editedTransform.source as TransformSource,
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
        loading: isUpdating,
        variant: "filled" as const,
        onClick: handleUpdateTransform,
      };
    }

    if (isNewTransform) {
      const hasEmptyContent = isSourceEmpty(
        editedTransform.source,
        databaseId,
        metadata,
      );
      return {
        disabled: isDisabled || hasEmptyContent,
        variant: "filled" as const,
        onClick: () => setSaveModalOpen(true),
      };
    }

    // External transform
    return {
      disabled: isDisabled,
      variant: hasChanges ? ("filled" as const) : ("default" as const),
      onClick: handleSaveExternalTransform,
    };
  };

  const buttonProps = getButtonProps();

  return (
    <>
      <Button size="sm" {...buttonProps}>{t`Save`}</Button>

      {saveModalOpen && (
        <CreateTransformModal
          source={editedTransform.source as TransformSource}
          defaultValues={initialCreateTransformValues}
          onClose={() => setSaveModalOpen(false)}
          schemasFilter={schemasFilter}
          validationSchemaExtension={validationSchemaExtension}
          validateOnMount
          handleSubmit={handleCreateNewTransform}
          targetDescription={t`This is the main table this transform owns. Runs from this workspace write to an isolated workspace copy, so the original table isn't changed until you merge the workspace.`}
          showIncrementalSettings={false}
        />
      )}
    </>
  );
};
