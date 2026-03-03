import { useMemo } from "react";

import { useGetTransformQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { useGetWorkspaceTransformQuery } from "metabase-enterprise/api";
import { extractTableId } from "metabase-enterprise/transforms-python/components/PythonTransformEditor/PythonDataPicker/utils";
import type {
  PythonTransformSource,
  PythonTransformTableAliases,
  TransformSource,
  TransformTarget,
  WorkspaceId,
  WorkspaceTransformListItem,
} from "metabase-types/api";

import { computeDiffStats, getSourceCode } from "../utils";

type UseTransformSourcesResult = {
  oldSource: string;
  oldSourceTables: PythonTransformTableAliases | undefined;
  oldTarget: TransformTarget | undefined;
  newSource: string;
  newSourceTables: PythonTransformTableAliases | undefined;
  newTarget: TransformTarget | undefined;
  isLoading: boolean;
  hasError: boolean;
  diffStats: { additions: number; deletions: number } | null;
};

export function useTransformSources(
  workspaceId: WorkspaceId,
  transform: WorkspaceTransformListItem,
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

  const globalTransform = globalTransformResult.data;
  const workspaceTransform = workspaceTransformResult.data;

  const isLoading =
    workspaceTransformResult.isLoading ||
    (!isNewTransform && globalTransformResult.isLoading);

  const hasError =
    !!workspaceTransformResult.error ||
    (!isNewTransform && !!globalTransformResult.error);

  const oldSource = useMemo(() => {
    return globalTransform ? getSourceCode(globalTransform, metadata) : "";
  }, [globalTransform, metadata]);

  const newSource = useMemo(() => {
    return workspaceTransform
      ? getSourceCode(workspaceTransform, metadata)
      : "";
  }, [workspaceTransform, metadata]);

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
    oldSourceTables: isPythonTransformSource(globalTransform?.source)
      ? normalizeSourceTables(globalTransform.source["source-tables"])
      : undefined,
    oldTarget: globalTransform?.target,
    newSource,
    newSourceTables: isPythonTransformSource(workspaceTransform?.source)
      ? normalizeSourceTables(workspaceTransform.source["source-tables"])
      : undefined,
    newTarget: workspaceTransform?.target,
    hasError,
    isLoading,
    diffStats,
  };
}

/**
 * Normalize source-tables from the backend (which may contain map refs with table_id)
 * to the canonical { alias: tableId } shape.
 */
function normalizeSourceTables(
  raw: Record<string, unknown>,
): PythonTransformTableAliases {
  const result: PythonTransformTableAliases = {};
  for (const [alias, value] of Object.entries(raw)) {
    const id = extractTableId(value as Record<string, unknown>);
    if (id != null) {
      result[alias] = id;
    }
  }
  return result;
}

function isPythonTransformSource(
  source: TransformSource | undefined,
): source is PythonTransformSource {
  return (
    source != null &&
    source.type === "python" &&
    source["source-database"] !== undefined
  );
}
