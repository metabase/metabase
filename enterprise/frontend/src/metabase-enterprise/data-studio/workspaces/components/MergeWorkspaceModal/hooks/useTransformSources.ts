import { useMemo } from "react";

import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import {
  useGetTransformQuery,
  useGetWorkspaceTransformQuery,
} from "metabase-enterprise/api";
import type { WorkspaceId, WorkspaceTransformItem } from "metabase-types/api";

import { computeDiffStats, getSourceCode } from "../utils";

type UseTransformSourcesResult = {
  oldSource: string;
  newSource: string;
  isLoading: boolean;
  hasError: boolean;
  diffStats: { additions: number; deletions: number } | null;
};

export function useTransformSources(
  workspaceId: WorkspaceId,
  transform: WorkspaceTransformItem,
): UseTransformSourcesResult {
  const metadata = useSelector(getMetadata);
  const isNewTransform = transform.global_id == null;

  const workspaceTransformResult = useGetWorkspaceTransformQuery({
    workspaceId,
    transformId: transform.ref_id,
  });

  const globalTransformResult = useGetTransformQuery(transform.global_id!, {
    skip: isNewTransform,
  });

  const isLoading =
    workspaceTransformResult.isLoading ||
    (!isNewTransform && globalTransformResult.isLoading);

  const hasError =
    !!workspaceTransformResult.error ||
    (!isNewTransform && !!globalTransformResult.error);

  const oldSource = useMemo(() => {
    return globalTransformResult.data
      ? getSourceCode(globalTransformResult.data, metadata)
      : "";
  }, [globalTransformResult.data, metadata]);

  const newSource = useMemo(() => {
    return workspaceTransformResult.data
      ? getSourceCode(workspaceTransformResult.data, metadata)
      : "";
  }, [workspaceTransformResult.data, metadata]);

  const diffStats = useMemo(() => {
    if (isNewTransform && newSource) {
      const lineCount = newSource.split("\n").length;
      return { additions: lineCount, deletions: 0 };
    }
    if (oldSource && newSource) {
      return computeDiffStats(oldSource, newSource);
    }
    return null;
  }, [isNewTransform, oldSource, newSource]);

  return {
    oldSource,
    newSource,
    isLoading,
    hasError,
    diffStats,
  };
}
