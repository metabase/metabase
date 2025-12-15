import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { Button } from "metabase/ui";
import { useCreateWorkspaceTransformMutation } from "metabase-enterprise/api";
import {
  addSuggestedTransform,
  getMetabotSuggestedTransform,
} from "metabase-enterprise/metabot/state";
import type { Transform, TransformId, WorkspaceId } from "metabase-types/api";

import { useWorkspace } from "./WorkspaceProvider";

interface Props {
  transform: Transform;
  workspaceId: WorkspaceId;
  onOpenTransform: (transformId: TransformId) => void;
}

export const CheckOutTransformButton = ({
  transform,
  workspaceId,
  onOpenTransform,
}: Props) => {
  const dispatch = useDispatch();
  const suggestedTransform = useSelector((state) =>
    getMetabotSuggestedTransform(state, transform.id),
  );
  const [createWorkspaceTransform] = useCreateWorkspaceTransformMutation();

  const {
    addOpenedTransform,
    removeOpenedTransform,
    setActiveTransform,
    removeEditedTransform,
  } = useWorkspace();

  const handleClick = async () => {
    const newTransform = await createWorkspaceTransform({
      id: workspaceId,
      global_id: transform.id,
      name: transform.name,
      description: transform.description,
      source: transform.source,
      target: transform.target,
      tag_ids: transform.tag_ids,
    }).unwrap();

    if (newTransform) {
      if (suggestedTransform) {
        dispatch(
          addSuggestedTransform({
            ...suggestedTransform,
            id: newTransform.id,
            active: true,
          }),
        );
      }

      removeEditedTransform(transform.id);
      addOpenedTransform(newTransform);
      removeOpenedTransform(transform.id);
      setActiveTransform(newTransform);
      onOpenTransform(newTransform.id);
    }
  };

  return (
    <Button
      size="sm"
      variant="filled"
      onClick={handleClick}
    >{t`Check out`}</Button>
  );
};
