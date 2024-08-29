import { useEffect } from "react";
import { replace } from "react-router-redux";
import { t } from "ttag";

import {
  useDatabaseListQuery,
  useSearchListQuery,
} from "metabase/common/hooks";
import { useHomepageDashboard } from "metabase/common/hooks/use-homepage-dashboard";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { canUseMetabotOnDatabase } from "metabase/metabot/utils";
import { updateUserSetting } from "metabase/redux/settings";
import { addUndo } from "metabase/redux/undo";
import { getHasDismissedCustomHomePageToast } from "metabase/selectors/app";
import type Database from "metabase-lib/v1/metadata/Database";
import type { CollectionItem } from "metabase-types/api";

import { getIsMetabotEnabled } from "../../selectors";
import { HomeContent } from "../HomeContent";
import { HomeLayout } from "../HomeLayout";

const SEARCH_QUERY = { models: ["dataset" as const], limit: 1 };

export const HomePage = (): JSX.Element => {
  const {
    databases,
    models,
    isMetabotEnabled,
    isLoading: isLoadingMetabot,
    error,
  } = useMetabot();
  const { isLoadingDash } = useDashboardRedirect();

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

const useDashboardRedirect = () => {
  const { dashboardId, dashboard, isLoading } = useHomepageDashboard();
  const hasDismissedToast = useSelector(getHasDismissedCustomHomePageToast);
  const dispatch = useDispatch();

  useEffect(() => {
    if (dashboardId && !isLoading && !dashboard?.archived) {
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
              updateUserSetting({
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
    hasDismissedToast,
    dispatch,
    dashboard?.archived,
    isLoading,
  ]);

  return {
    isLoadingDash: isLoading,
  };
};
