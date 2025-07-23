import type { UseFetchTransformsResult } from "metabase/plugins";
import { useLazyListTransformsQuery } from "metabase-enterprise/api";

export function useFetchTransforms(): UseFetchTransformsResult {
  const [fetchTransforms] = useLazyListTransformsQuery();
  return [fetchTransforms];
}
