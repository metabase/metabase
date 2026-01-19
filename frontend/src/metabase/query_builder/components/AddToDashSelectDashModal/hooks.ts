import { useAsync } from "react-use";

import { ActivityApi } from "metabase/services";
import type { Dashboard } from "metabase-types/api";

export const useMostRecentlyViewedDashboard = () => {
  const {
    loading: isLoading,
    error,
    value: data,
  } = useAsync(
    () =>
      ActivityApi.most_recently_viewed_dashboard() as Promise<Dashboard | null>,
  );

  return { data, isLoading, error };
};
