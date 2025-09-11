import type {
  UseCheckDependenciesProps,
  UseCheckDependenciesResult,
} from "metabase/plugins";
import { useLazyCheckTransformDependenciesQuery } from "metabase-enterprise/api";
import type { UpdateTransformRequest } from "metabase-types/api";

import { useCheckDependencies } from "../use-check-dependencies";

export function useCheckTransformDependencies({
  onSave,
  onError,
}: UseCheckDependenciesProps<UpdateTransformRequest>): UseCheckDependenciesResult<UpdateTransformRequest> {
  return useCheckDependencies({
    getCheckDependenciesRequest,
    useLazyCheckDependenciesQuery: useLazyCheckTransformDependenciesQuery,
    onSave,
    onError,
  });
}

function getCheckDependenciesRequest(
  request: UpdateTransformRequest,
): UpdateTransformRequest {
  return request;
}
