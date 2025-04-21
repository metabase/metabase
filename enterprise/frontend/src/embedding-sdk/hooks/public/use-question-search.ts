import { useMemo } from "react";

import { useSdkSelector } from "embedding-sdk/store";
import { getIsLoggedIn } from "embedding-sdk/store/selectors";
import type { MetabaseCollectionItem } from "embedding-sdk/types/collection";
import { useSearchListQuery } from "metabase/common/hooks";

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

  return useSearchListQuery<MetabaseCollectionItem, null>({
    query,
    enabled: isLoggedIn,
  }) as {
    data?: MetabaseCollectionItem[];
    isLoaded: boolean;
    isLoading: boolean;
    error: unknown;
  };
};
