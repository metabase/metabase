import { useSearchListQuery } from "metabase/common/hooks";

export const useQuestionSearch = (searchQuery?: string) =>
  useSearchListQuery({
    query: {
      q: searchQuery ?? undefined,
      models: ["card"],
    },
    reload: true,
  });
