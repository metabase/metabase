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
}: UseCheckDependenciesProps<UpdateSnippetRequest>): UseCheckDependenciesResult<UpdateSnippetRequest> {
  return useCheckDependencies({
    getCheckDependenciesRequest,
    useLazyCheckDependenciesQuery: useLazyCheckSnippetDependenciesQuery,
    onSave,
  });
}

function getCheckDependenciesRequest({
  id,
  name,
  content,
}: UpdateSnippetRequest): CheckSnippetDependenciesRequest {
  return { id, name, content };
}
