import { useEffect } from "react";
import { t } from "ttag";
import { replace } from "react-router-redux";
import { updateSetting } from "metabase/admin/settings/settings";
import { addUndo } from "metabase/redux/undo";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  useDashboardQuery,
  useDatabaseListQuery,
  useSearchListQuery,
} from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { canUseMetabotOnDatabase } from "metabase/metabot/utils";
import type { CollectionItem, DashboardId } from "metabase-types/api";
import { getSettingsLoading } from "metabase/selectors/settings";
import type Database from "metabase-lib/metadata/Database";
import {
  getCustomHomePageDashboardId,
  getHasDismissedCustomHomePageToast,
  getIsMetabotEnabled,
} from "../../selectors";
import { HomeLayout } from "../HomeLayout";
import { HomeContent } from "../HomeContent";

const SEARCH_QUERY = { models: "dataset", limit: 1 } as const;

export const HomePage = (): JSX.Element => {
  const {
    databases,
    models,
    isMetabotEnabled,
    isLoading: isLoadingMetabot,
    error,
  } = useMetabot();
  const { isLoadingDash } = useDashboardPage();

  if ((isLoadingMetabot || error) && isMetabotEnabled) {
    return <LoadingAndErrorWrapper loading={isLoadingMetabot} error={error} />;
  }

  if (isLoadingDash) {
    return <LoadingAndErrorWrapper loading={isLoadingDash} error={error} />;
  }

  return (
    <HomeLayout hasMetabot={getHasMetabot(databases, models, isMetabotEnabled)}>
      <HomeContent />
    </HomeLayout>
  );
};

const useMetabot = () => {
  const isMetabotEnabled = useSelector(getIsMetabotEnabled);
  const databaseListQuery = useDatabaseListQuery({
    enabled: isMetabotEnabled,
  });
  const searchListQuery = useSearchListQuery({
    query: SEARCH_QUERY,
    enabled: isMetabotEnabled,
  });

  return {
    databases: databaseListQuery.data ?? [],
    models: searchListQuery.data ?? [],
    isMetabotEnabled,
    isLoading: databaseListQuery.isLoading || searchListQuery.isLoading,
    error: databaseListQuery.error ?? searchListQuery.error,
  };
};

const getHasMetabot = (
  databases: Database[],
  models: CollectionItem[],
  isMetabotEnabled: boolean,
) => {
  const hasModels = models.length > 0;
  const hasSupportedDatabases = databases.some(canUseMetabotOnDatabase);
  return hasModels && hasSupportedDatabases && isMetabotEnabled;
};

const useDashboardPage = () => {
  const dashboardId = useSelector(getCustomHomePageDashboardId);
  const isLoadingSettings = useSelector(getSettingsLoading);
  const hasDismissedToast = useSelector(getHasDismissedCustomHomePageToast);
  const dispatch = useDispatch();

  const { data: dashboard, isLoading: isLoadingDash } = useDashboardQuery({
    enabled: dashboardId !== null,
    id: dashboardId as DashboardId,
  });

  useEffect(() => {
    if (
      dashboardId &&
      !isLoadingSettings &&
      !isLoadingDash &&
      !dashboard?.archived
    ) {
      dispatch(
        replace({
          pathname: `/dashboard/${dashboardId}`,
          state: { preserveNavbarState: true },
        }),
      );

      if (!hasDismissedToast) {
        dispatch(
          addUndo({
            message: t`Your admin has set this dashboard as your homepage`,
            icon: "info",
            timeout: 10000,
            actions: [
              updateSetting({
                key: "dismissed-custom-dashboard-toast",
                value: true,
              }),
            ],
            actionLabel: t`Got it`,
            canDismiss: false,
          }),
        );
      }
    }
  }, [
    dashboardId,
    isLoadingSettings,
    hasDismissedToast,
    dispatch,
    isLoadingDash,
    dashboard?.archived,
  ]);

  return {
    isLoadingDash: isLoadingDash || isLoadingSettings,
  };
};
