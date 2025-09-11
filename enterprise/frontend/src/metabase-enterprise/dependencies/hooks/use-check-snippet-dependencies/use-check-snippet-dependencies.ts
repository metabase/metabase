import type {
  UseCheckDependenciesProps,
  UseCheckDependenciesResult,
} from "metabase/plugins";
import { useLazyCheckSnippetDependenciesQuery } from "metabase-enterprise/api";
import type {
  CheckSnippetDependenciesRequest,
  UpdateSnippetRequest,
} from "metabase-types/api";

import { useCheckDependencies } from "../use-check-dependencies";

export function useCheckSnippetDependencies({
  onSave,
  onError,
}: UseCheckDependenciesProps<UpdateSnippetRequest>): UseCheckDependenciesResult<UpdateSnippetRequest> {
  return useCheckDependencies({
    getCheckDependenciesRequest,
    useLazyCheckDependenciesQuery: useLazyCheckSnippetDependenciesQuery,
    onSave,
    onError,
  });
}

function getCheckDependenciesRequest(
  request: UpdateSnippetRequest,
): CheckSnippetDependenciesRequest {
  return request;
}
