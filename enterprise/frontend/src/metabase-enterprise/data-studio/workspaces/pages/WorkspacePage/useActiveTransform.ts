import { skipToken, useGetTransformQuery } from "metabase/api";
import { useGetWorkspaceTransformQuery } from "metabase-enterprise/api";
import type { TaggedTransform, WorkspaceId } from "metabase-types/api";

import type { AnyWorkspaceTransformRef } from "./WorkspaceProvider";

export const useActiveTransform = ({
  transformRef,
  workspaceId,
}: {
  transformRef: AnyWorkspaceTransformRef | null;
  workspaceId: WorkspaceId;
}) => {
  const transformQuery = useGetTransformQuery(
    transformRef?.type === "transform" ? transformRef.id : skipToken,
  );

  const workspaceTransformQuery = useGetWorkspaceTransformQuery(
    transformRef?.type === "workspace-transform"
      ? { transformId: transformRef.ref_id, workspaceId }
      : skipToken,
  );

  if (transformRef?.type === "transform") {
    const transform = transformQuery.data;
    const taggedTransform: TaggedTransform | null = transform
      ? { ...transform, type: "transform" }
      : null;

    return {
      ...transformQuery,
      data: taggedTransform,
    };
  }

  if (transformRef?.type === "workspace-transform") {
    return {
      ...workspaceTransformQuery,
      data: workspaceTransformQuery.data ?? null,
    };
  }

  return {
    data: null, // TODO: unsaved trasnform
    isLoading: false,
    error: undefined,
  };
};
