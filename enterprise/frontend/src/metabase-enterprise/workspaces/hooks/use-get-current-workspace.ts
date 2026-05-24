import type { UseGetCurrentWorkspaceResult } from "metabase/plugins";
import { useGetCurrentWorkspaceQuery } from "metabase-enterprise/api";

export function useGetCurrentWorkspace(): UseGetCurrentWorkspaceResult {
  const { data, isLoading } = useGetCurrentWorkspaceQuery();
  return {
    workspace: data ?? null,
    isLoading,
  };
}
