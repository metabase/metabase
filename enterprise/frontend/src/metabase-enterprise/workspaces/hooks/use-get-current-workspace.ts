import type {
  UseGetCurrentWorkspaceOptions,
  UseGetCurrentWorkspaceResult,
} from "metabase/plugins";
import { useGetCurrentWorkspaceQuery } from "metabase-enterprise/api";

export function useGetCurrentWorkspace({
  skip,
}: UseGetCurrentWorkspaceOptions = {}): UseGetCurrentWorkspaceResult {
  const { data, isLoading } = useGetCurrentWorkspaceQuery(undefined, { skip });
  return {
    workspace: data ?? null,
    isLoading,
  };
}
