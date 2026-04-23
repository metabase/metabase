import { skipToken, useGetCardQuery, useGetDashboardQuery } from "metabase/api";
import type { SdkIframeEmbedSetupExperience } from "metabase/embedding/embedding-iframe-sdk-setup/types";
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
  const {
    data: dashboard,
    error: dashboardLoadingError,
    isLoading: isDashboardLoading,
    isFetching: isDashboardFetching,
  } = useGetDashboardQuery(
    dashboardId ? { id: dashboardId as number } : skipToken,
    { refetchOnMountOrArgChange: true },
  );

  const {
    data: card,
    error: cardLoadingError,
    isLoading: isCardLoading,
    isFetching: isCardFetching,
  } = useGetCardQuery(questionId ? { id: questionId as number } : skipToken, {
    refetchOnMountOrArgChange: true,
  });

  const isLoading = isDashboardLoading || isCardLoading;
  const isFetching = isDashboardFetching || isCardFetching;

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
