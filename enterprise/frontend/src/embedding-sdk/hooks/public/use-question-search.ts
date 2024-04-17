import { useMemo } from "react";

import { useEmbeddingContext } from "embedding-sdk/context";
import { useSearchListQuery } from "metabase/common/hooks";

export const useQuestionSearch = (searchQuery?: string) => {
  const { isInitialized, isLoggedIn } = useEmbeddingContext();

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

  return useSearchListQuery({
    query,
    enabled: isLoggedIn && isInitialized,
  });
};
