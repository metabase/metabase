import { t } from "ttag";

import { Button } from "metabase/ui";
import {
  useUpdateTransformMutation,
  useUpdateWorkspaceTransformMutation,
  workspaceApi,
} from "metabase-enterprise/api";
import { isSameSource } from "metabase-enterprise/transforms/utils";
import type {
  DatabaseId,
  Transform,
  WorkspaceTransform,
} from "metabase-types/api";

import { useWorkspace } from "./WorkspaceProvider";
import { useDispatch } from "metabase/lib/redux";

interface Props {
  databaseId: DatabaseId;
  editedTransform: WorkspaceTransform;
  transform: WorkspaceTransform;
  workspaceId: string | number;
}

export const SaveTransformButton = ({
  databaseId,
  editedTransform,
  transform,
  workspaceId,
}: Props) => {
  const [updateTransform] = useUpdateWorkspaceTransformMutation();
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
      workspaceId,
      transformId: transform.id,
      source: editedTransform.source,
      name: editedTransform.name,
      target: {
        type: "table",
        name: editedTransform.target.name,
        schema: transform.target.schema,
        database: databaseId,
      },
    }).unwrap();

    updateTransformState(updated);
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
