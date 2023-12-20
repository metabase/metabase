import type { RecentItem } from "metabase-types/api";
import { useSWRQuery } from "../use-swr-query";

export const useRecentItemListQuery = () => {
  return useSWRQuery<RecentItem[]>("/api/activity/recent_views");
};
