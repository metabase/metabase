import { useSearchQuery } from "metabase/api";

export const useHasQuestions = (): boolean => {
  const { data } = useSearchQuery({ models: ["card"], limit: 1 });
  return data ? data.total > 0 : false;
};
