import type { PopularItem } from "metabase-types/api";
import { useSWRQuery } from "../use-swr-query";

export const usePopularItemListQuery = () => {
  return useSWRQuery<PopularItem[]>("/api/activity/popular_items");
};
