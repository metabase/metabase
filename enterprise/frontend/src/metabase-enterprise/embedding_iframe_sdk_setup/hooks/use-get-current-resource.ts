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
  settings,
}: {
  experience: SdkIframeEmbedSetupExperience;
  settings: SdkIframeEmbedSetupSettings;
}) => {
  const dispatch = useDispatch();

  const { loading: isDashboardLoading, error: dashboardLoadingError } =
    useAsync(async () => {
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
    error: cardLoadingError,
    isLoading: isCardLoading,
    isFetching: isCardFetching,
  } = useGetCardQuery(
    settings.questionId ? { id: settings.questionId as number } : skipToken,
  );

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
