import { useAsync } from "react-use";

import { ActivityApi } from "metabase/services";
import type { Dashboard } from "metabase-types/api";

export const useMostRecentlyViewedDashboard = () => {
  const {
    loading: isLoading,
    error,
    value: data,
  } = useAsync(async () => {
    const dashboard: Dashboard | undefined =
      await ActivityApi.most_recently_viewed_dashboard();

    return dashboard;
  });

  return { data, isLoading, error };
};
