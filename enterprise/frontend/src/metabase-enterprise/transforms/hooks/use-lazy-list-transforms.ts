import type { UseLazyListTransformsResult } from "metabase/plugins";
import { useLazyListTransformsQuery } from "metabase-enterprise/api";

export function useLazyListTransforms(): UseLazyListTransformsResult {
  const [fetchTransforms, fetchState] = useLazyListTransformsQuery();
  return [fetchTransforms, fetchState];
}
