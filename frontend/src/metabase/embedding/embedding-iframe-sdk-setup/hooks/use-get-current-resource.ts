import { useAsync } from "react-use";

import { skipToken, useGetCardQuery } from "metabase/api";
import { fetchDashboard } from "metabase/dashboard/actions";
import { getDashboardComplete } from "metabase/dashboard/selectors";
import type { SdkIframeEmbedSetupExperience } from "metabase/embedding/embedding-iframe-sdk-setup/types";
import { useDispatch, useSelector } from "metabase/lib/redux";
import type { Card, Dashboard, DashboardId } from "metabase-types/api";

const getResource = ({
  experience,
  dashboard,
  card,
}: {
  experience: SdkIframeEmbedSetupExperience;
  dashboard: Dashboard | null | undefined;
  card: Card | null | undefined;
}) => {
  if (experience === "dashboard" && dashboard) {
    return dashboard;
  }

  if (experience === "chart" && card) {
    return card;
  }

  return null;
};

export const useGetCurrentResource = ({
  experience,
  dashboardId,
  questionId,
}: {
  experience: SdkIframeEmbedSetupExperience;
  dashboardId?: DashboardId | null;
  questionId?: string | number | null;
}) => {
  const dispatch = useDispatch();

  const { loading: isDashboardLoading, error: dashboardLoadingError } =
    useAsync(async () => {
      if (!dashboardId) {
        return;
      }

      await dispatch(
        fetchDashboard({
          dashId: dashboardId as number,
          queryParams: {},
        }),
      );
    }, [dashboardId, dispatch]);
  const dashboard = useSelector(getDashboardComplete);

  const {
    data: card,
    error: cardLoadingError,
    isLoading: isCardLoading,
    isFetching: isCardFetching,
  } = useGetCardQuery(questionId ? { id: questionId as number } : skipToken, {
    refetchOnMountOrArgChange: true,
  });

  const isLoading = isDashboardLoading || isCardLoading;
  const isFetching = isCardFetching;

  const resource = getResource({
    experience,
    dashboard,
    card,
  });

  const isError = !!dashboardLoadingError || !!cardLoadingError;

  return {
    resource,
    isError,
    isLoading,
    isFetching,
  };
};
