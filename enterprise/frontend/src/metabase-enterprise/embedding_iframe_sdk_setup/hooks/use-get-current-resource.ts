import { skipToken, useGetCardQuery, useGetDashboardQuery } from "metabase/api";
import type { SdkIframeEmbedSetupSettings } from "metabase-enterprise/embedding_iframe_sdk_setup/types";

export const useGetCurrentResource = (
  settings: SdkIframeEmbedSetupSettings,
) => {
  const {
    data: dashboard,
    isLoading: isDashboardLoading,
    isFetching: isDashboardFetching,
  } = useGetDashboardQuery(
    settings.dashboardId ? { id: settings.dashboardId } : skipToken,
    { refetchOnMountOrArgChange: true },
  );

  const {
    data: card,
    isLoading: isCardLoading,
    isFetching: isCardFetching,
  } = useGetCardQuery(
    settings.questionId ? { id: settings.questionId as number } : skipToken,
    { refetchOnMountOrArgChange: true },
  );

  return {
    resource: dashboard ?? card ?? null,
    isLoading: isDashboardLoading || isCardLoading,
    isFetching: isDashboardFetching || isCardFetching,
  };
};
