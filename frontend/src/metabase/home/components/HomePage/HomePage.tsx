import { useEffect } from "react";
import { t } from "ttag";
import { replace } from "react-router-redux";
import { isSmallScreen } from "metabase/lib/dom";
import { openNavbar } from "metabase/redux/app";
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
  const { databases, models, isMetabotEnabled, isLoading, error } =
    useMetabot();
  useNavbar();
  useDashboardPage();

  if ((isLoading || error) && isMetabotEnabled) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <HomeLayout hasMetabot={getHasMetabot(databases, models, isMetabotEnabled)}>
      <HomeContent />
    </HomeLayout>
  );
};

const useNavbar = () => {
  const dispatch = useDispatch();

  useEffect(() => {
    if (!isSmallScreen()) {
      dispatch(openNavbar());
    }
  }, [dispatch]);
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
      dispatch(replace(`/dashboard/${dashboardId}`));

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
};
