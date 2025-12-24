import type {
  UseCheckDependenciesProps,
  UseCheckDependenciesResult,
} from "metabase/plugins";
import { useLazyCheckTransformDependenciesQuery } from "metabase-enterprise/api";
import type {
  CheckTransformDependenciesRequest,
  UpdateTransformRequest,
} from "metabase-types/api";

import { useCheckDependencies } from "../use-check-dependencies";

export function useCheckTransformDependencies({
  onSave,
}: UseCheckDependenciesProps<UpdateTransformRequest>): UseCheckDependenciesResult<UpdateTransformRequest> {
  return useCheckDependencies({
    getCheckDependenciesRequest,
    useLazyCheckDependenciesQuery: useLazyCheckTransformDependenciesQuery,
    onSave,
  });
}

function getCheckDependenciesRequest({
  id,
  source,
}: UpdateTransformRequest): CheckTransformDependenciesRequest {
  return { id, source };
}
