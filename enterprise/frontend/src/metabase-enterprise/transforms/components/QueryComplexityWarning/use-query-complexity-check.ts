import { useCallback, useState } from "react";

import { useLazyCheckQueryComplexityQuery } from "metabase-enterprise/api";

export const useQueryComplexityCheck = () => {
  const [checkQueryComplexity] = useLazyCheckQueryComplexityQuery();
  const [shouldShowWarning, setShouldShowWarning] = useState(false);

  const tryCheckQueryComplexity = useCallback(
    async (queryText: string) => {
      const result = await checkQueryComplexity(queryText, true).unwrap();
      setShouldShowWarning(result?.is_simple === false);
    },
    [checkQueryComplexity],
  );

  /**
   * Check query complexity and return whether warning should be shown.
   * Use this for pre-save validation where you need the result immediately.
   */
  const checkIsQueryComplex = useCallback(
    async (queryText: string): Promise<boolean> => {
      const result = await checkQueryComplexity(queryText, true).unwrap();
      return result?.is_simple === false;
    },
    [checkQueryComplexity],
  );

  return {
    tryCheckQueryComplexity,
    shouldShowWarning,
    checkIsQueryComplex,
  };
};
