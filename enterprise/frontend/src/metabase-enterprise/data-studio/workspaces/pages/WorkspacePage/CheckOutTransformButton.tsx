import { t } from "ttag";

import { Button } from "metabase/ui";
import {
  useLazyGetTransformQuery,
  useUpdateWorkspaceContentsMutation,
} from "metabase-enterprise/api";
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
  const [getTransform] = useLazyGetTransformQuery();
  const [updateWorkspaceContents] = useUpdateWorkspaceContentsMutation();

  const {
    addOpenedTransform,
    removeOpenedTransform,
    setActiveTransform,
    removeEditedTransform,
  } = useWorkspace();

  const handleClick = async () => {
    const response = await updateWorkspaceContents({
      id: workspaceId,
      add: {
        transforms: [transform.id],
      },
    });

    const newTransform = response.data?.contents.transforms.find(
      (t) => t.upstream_id === transform.id,
    );
    const newTransformId = newTransform?.id;

    if (newTransformId != null) {
      // TODO: remove when backend adds contents hydration to previous request
      const newTransform = await getTransform(newTransformId).unwrap();

      if (newTransform) {
        removeEditedTransform(transform.id);
        addOpenedTransform(newTransform);
        removeOpenedTransform(transform.id);
        setActiveTransform(newTransform);
        onOpenTransform(newTransform.id);
      }
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
