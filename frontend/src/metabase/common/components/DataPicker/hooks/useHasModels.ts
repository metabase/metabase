import { useSearchQuery } from "metabase/api";

export const useHasModels = (): boolean => {
  const { data } = useSearchQuery({ models: ["dataset"], limit: 1 });
  return data ? data.total > 0 : false;
};
