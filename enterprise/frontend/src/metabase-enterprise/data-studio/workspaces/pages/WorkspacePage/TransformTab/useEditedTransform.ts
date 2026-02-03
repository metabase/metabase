import { isSameSource } from "metabase-enterprise/transforms/utils";

import type {
  AnyWorkspaceTransform,
  EditedTransform,
} from "../WorkspaceProvider";
import { getTransformId, useWorkspace } from "../WorkspaceProvider";

interface UseEditedTransformResult {
  editedTransform: EditedTransform;
  hasChanges: boolean;
  providerEdited: EditedTransform | undefined;
}

/**
 * Hook to get the edited transform state and detect changes.
 * Used by both TransformTab and SaveTransformButton to avoid duplication.
 */
export function useEditedTransform(
  transform: AnyWorkspaceTransform,
): UseEditedTransformResult {
  const { editedTransforms } = useWorkspace();
  const transformId = getTransformId(transform);
  const providerEdited = editedTransforms.get(transformId);

  const editedTransform: EditedTransform = {
    name: providerEdited?.name ?? transform.name,
    source: providerEdited?.source ?? transform.source,
    target: providerEdited?.target ?? transform.target,
  };

  const hasSourceChanged = !isSameSource(
    editedTransform.source,
    transform.source,
  );
  const hasTargetNameChanged =
    "target" in editedTransform &&
    "target" in transform &&
    transform.target.name !== editedTransform.target.name;
  const hasTargetSchemaChanged =
    "target" in editedTransform &&
    "target" in transform &&
    transform.target.schema !== editedTransform.target.schema;
  const hasChanges =
    hasSourceChanged || hasTargetNameChanged || hasTargetSchemaChanged;

  return { editedTransform, hasChanges, providerEdited };
}
