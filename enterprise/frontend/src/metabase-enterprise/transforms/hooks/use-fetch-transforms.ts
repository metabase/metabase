import type { UseFetchTransformsResult } from "metabase/plugins";
import { useLazyListTransformsQuery } from "metabase-enterprise/api";

export function useFetchTransforms(): UseFetchTransformsResult {
  const [fetchTransforms, fetchState] = useLazyListTransformsQuery();
  return [fetchTransforms, fetchState];
}
