import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { Button } from "metabase/ui";
import {
  useUpdateTransformMutation,
  workspaceApi,
} from "metabase-enterprise/api";
import { isSameSource } from "metabase-enterprise/transforms/utils";
import type { DatabaseId, Transform, WorkspaceId } from "metabase-types/api";

import { type EditedTransform, useWorkspace } from "./WorkspaceProvider";

interface Props {
  databaseId: DatabaseId;
  editedTransform: EditedTransform;
  transform: Transform;
  workspaceId: WorkspaceId;
}

export const SaveTransformButton = ({
  databaseId,
  editedTransform,
  transform,
  workspaceId,
}: Props) => {
  const dispatch = useDispatch();
  const [updateTransform] = useUpdateTransformMutation();

  const { updateTransformState } = useWorkspace();

  const hasSourceChanged = !isSameSource(
    editedTransform.source,
    transform.source,
  );
  const hasTargetNameChanged =
    transform.target.name !== editedTransform.target.name;
  const hasChanges = hasSourceChanged || hasTargetNameChanged;

  const handleClick = async () => {
    const updated = await updateTransform({
      id: transform.id,
      source: editedTransform.source,
      name: editedTransform.name,
      target: {
        type: "table",
        name: editedTransform.target.name,
        schema: transform.target.schema,
        database: databaseId,
      },
    }).unwrap();

    updateTransformState(updated, null);
    dispatch(
      workspaceApi.util.invalidateTags([
        { type: "workspace", id: workspaceId },
        { type: "transform", id: transform.id },
      ]),
    );
  };

  return (
    <Button
      disabled={!hasChanges}
      size="sm"
      variant="filled"
      onClick={handleClick}
    >{t`Save`}</Button>
  );
};
