import { useAsync } from "react-use";
import { Dashboard } from "metabase-types/api";
import { ActivityApi } from "metabase/services";

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
