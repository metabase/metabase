import { useAsync } from "react-use";

import { skipToken, useGetCardQuery } from "metabase/api";
import { fetchDashboard } from "metabase/dashboard/actions";
import { getDashboardComplete } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import type {
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupSettings,
} from "metabase-enterprise/embedding_iframe_sdk_setup/types";
import type { Card, Dashboard } from "metabase-types/api";

const getResource = ({
  experience,
  dashboard,
  isDashboardLoading,
  card,
  isCardLoading,
}: {
  experience: SdkIframeEmbedSetupExperience;
  dashboard: Dashboard | null | undefined;
  card: Card | null | undefined;
  isDashboardLoading: boolean;
  isCardLoading: boolean;
}) => {
  const isResourceWithDifferentTypeLoading =
    (experience !== "dashboard" && isDashboardLoading) ||
    (experience !== "chart" && isCardLoading);

  if (isResourceWithDifferentTypeLoading) {
    return null;
  }

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
  settings,
}: {
  experience: SdkIframeEmbedSetupExperience;
  settings: SdkIframeEmbedSetupSettings;
}): {
  resource: Dashboard | Card | null;
  isLoading: boolean;
  isFetching: boolean;
} => {
  const dispatch = useDispatch();

  const { loading: isDashboardLoading } = useAsync(async () => {
    if (!settings.dashboardId) {
      return;
    }

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

  const isLoading = isDashboardLoading || isCardLoading;
  const isFetching = isCardFetching;

  const resource = getResource({
    experience,
    dashboard,
    card,
    isDashboardLoading,
    isCardLoading,
  });

  return {
    resource,
    isLoading,
    isFetching,
  };
};
