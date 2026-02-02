import { useListRecentsQuery } from "metabase/api";
import type { RecentItem } from "metabase-types/api";

interface UseMetricRecentsResult {
  metricRecents: RecentItem[];
  isLoading: boolean;
}

export function useMetricRecents(): UseMetricRecentsResult {
  const { data = [], isLoading } = useListRecentsQuery(
    { context: ["selections", "views"] },
    { refetchOnMountOrArgChange: true },
  );

  const metricRecents = data
    .filter(item => item.model === "metric")
    .slice(0, 5);

  return { metricRecents, isLoading };
}
