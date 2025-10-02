import { useAsync } from "react-use";

import { skipToken, useGetCardQuery } from "metabase/api";
import { fetchDashboard } from "metabase/dashboard/actions";
import { getDashboardComplete } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import type { SdkIframeEmbedSetupSettings } from "metabase-enterprise/embedding_iframe_sdk_setup/types";

export const useGetCurrentResource = (
  settings: SdkIframeEmbedSetupSettings,
) => {
  const dispatch = useDispatch();

  const { loading: isDashboardLoading } = useAsync(async () => {
    await dispatch(
      fetchDashboard({
        dashId: settings.dashboardId as number,
        queryParams: {},
      }),
    );
  }, [settings.dashboardId, dispatch]);
  const dashboard = useSelector(getDashboardComplete);

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
    isFetching: isCardFetching,
  };
};
