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

  return {
    tryCheckQueryComplexity,
    shouldShowWarning,
  };
};
