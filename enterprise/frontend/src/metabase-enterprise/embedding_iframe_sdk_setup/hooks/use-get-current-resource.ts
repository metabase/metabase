import { useAsync } from "react-use";

import { skipToken, useGetCardQuery } from "metabase/api";
import { fetchDashboard } from "metabase/dashboard/actions";
import { getDashboardComplete } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import type { EmbedResourceType } from "metabase/public/lib/types";
import type { SdkIframeEmbedSetupSettings } from "metabase-enterprise/embedding_iframe_sdk_setup/types";
import type { Card, Dashboard } from "metabase-types/api";

const getResourceData = ({
  dashboard,
  isDashboardLoading,
  card,
  isCardLoading,
}: {
  dashboard: Dashboard | null | undefined;
  isDashboardLoading: boolean;
  card: Card | null | undefined;
  isCardLoading: boolean;
}) => {
  const isResourceWithDifferentTypeLoading =
    (dashboard && isCardLoading) || (card && isDashboardLoading);

  if (isResourceWithDifferentTypeLoading) {
    return {
      resource: null,
      resourceType: null,
    };
  }

  if (dashboard) {
    return {
      resource: dashboard,
      resourceType: "dashboard",
    } as const;
  } else if (card) {
    return {
      resource: card,
      resourceType: "question",
    } as const;
  } else {
    return {
      resource: null,
      resourceType: null,
    };
  }
};

export const useGetCurrentResource = ({
  settings,
}: {
  settings: SdkIframeEmbedSetupSettings;
}): {
  resource: Dashboard | Card | null;
  resourceType: EmbedResourceType | null;
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

  const { resource, resourceType } = getResourceData({
    dashboard,
    isDashboardLoading,
    card,
    isCardLoading,
  });

  return {
    resource,
    resourceType,
    isLoading,
    isFetching,
  };
};
