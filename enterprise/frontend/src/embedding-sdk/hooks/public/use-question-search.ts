import { useMemo } from "react";

import { useSdkSelector } from "embedding-sdk/store";
import { getIsLoggedIn } from "embedding-sdk/store/selectors";
import { useSearchQuery } from "metabase/api";

export const useQuestionSearch = (searchQuery?: string) => {
  const isLoggedIn = useSdkSelector(getIsLoggedIn);

  const query = useMemo(() => {
    return searchQuery
      ? {
          q: searchQuery,
          models: ["card" as const],
        }
      : {
          models: ["card" as const],
        };
  }, [searchQuery]);

  return useSearchQuery(query, { skip: !isLoggedIn });
};
