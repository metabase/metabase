import { t } from "ttag";

import { Button } from "metabase/ui";
import {
  useUpdateTransformMutation,
  workspaceApi,
} from "metabase-enterprise/api";
import { isSameSource } from "metabase-enterprise/transforms/utils";
import type { DatabaseId, Transform } from "metabase-types/api";

import { type EditedTransform, useWorkspace } from "./WorkspaceProvider";
import { useDispatch } from "metabase/lib/redux";

interface Props {
  databaseId: DatabaseId;
  editedTransform: EditedTransform;
  transform: Transform;
  workspaceId: string | number;
}

export const SaveTransformButton = ({
  databaseId,
  editedTransform,
  transform,
  workspaceId,
}: Props) => {
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
