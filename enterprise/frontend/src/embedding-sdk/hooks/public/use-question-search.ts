import { useMemo } from "react";

import { useSearchListQuery } from "metabase/common/hooks";

import { useEmbeddingContext } from "embedding-sdk/context";

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
