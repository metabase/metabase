import { useAsync } from "react-use";
import { Dashboard } from "metabase-types/api";
import { ActivityApi } from "metabase/services";

interface HttpError {
  data: string;
  isCancelled: boolean;
  status: number;
}

const isHttpError = (error: unknown): error is HttpError => {
  if (typeof error === "object" && error) {
    return "status" in error;
  }

  return false;
};

export const useMostRecentlyViewedDashboard = () => {
  const {
    loading: isLoading,
    error,
    value: data,
  } = useAsync(async () => {
    let dashboard: Dashboard | undefined;

    // try {
      dashboard = await ActivityApi.most_recently_viewed_dashboard();
    // } catch (error) {
    //   if (isHttpError(error)) {
    //     if (error.status === 404) {
    //       // there is no viewed dashboards in the last 24 hours
    //         console.warn(
    //         "You didn't visit any dashboard during last 24 hours, fallback to the default behavior",
    //       );
    //     }
    //   }

    //   // it is not expected
    //   throw error;
    // }

    return dashboard;
  });

  return { data, isLoading, error };
};
