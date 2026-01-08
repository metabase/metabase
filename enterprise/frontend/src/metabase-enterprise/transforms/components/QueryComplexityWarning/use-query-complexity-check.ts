import { useCallback } from "react";

import { useLazyCheckQueryComplexityQuery } from "metabase-enterprise/api";
import type { CheckQueryComplexityResponse } from "metabase-types/api";

export const useQueryComplexityCheck = () => {
  const [checkQueryComplexity, { data: complexity }] =
    useLazyCheckQueryComplexityQuery();

  const checkIsQueryComplex = useCallback(
    async (queryText: string): Promise<CheckQueryComplexityResponse> =>
      await checkQueryComplexity(queryText, true).unwrap(),
    [checkQueryComplexity],
  );

  return {
    checkIsQueryComplex,
    complexity,
  };
};
