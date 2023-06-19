import { useEffect } from "react";
import { t } from "ttag";
import { replace } from "react-router-redux";
import { isSmallScreen } from "metabase/lib/dom";
import { openNavbar } from "metabase/redux/app";
import { updateSetting } from "metabase/admin/settings/settings";
import { addUndo } from "metabase/redux/undo";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  useDatabaseListQuery,
  useSearchListQuery,
} from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { canUseMetabotOnDatabase } from "metabase/metabot/utils";
import { getSetting } from "metabase/selectors/settings";
import { CollectionItem } from "metabase-types/api";
import Database from "metabase-lib/metadata/Database";

import {
  getCustomHomePageDashboardId,
  getIsMetabotEnabled,
} from "../../selectors";
import { HomeLayout } from "../HomeLayout";
import { HomeContent } from "../HomeContent";

const SEARCH_QUERY = { models: "dataset", limit: 1 } as const;

export const HomePage = (): JSX.Element => {
  const databaseListState = useDatabaseListQuery();
  const modelListState = useSearchListQuery({
    query: SEARCH_QUERY,
  });
  const isLoading = databaseListState.isLoading || modelListState.isLoading;
  const error = databaseListState.error ?? modelListState.error;
  const dashboardId = useSelector(state => {
    return !state.settings.loading && getCustomHomePageDashboardId(state);
  });
  const showHomepageRedirectRoast = useSelector(state => {
    return !getSetting(state, "dismissed-custom-dashboard-toast");
  });
  const isMetabotEnabled = useSelector(getIsMetabotEnabled);
  const hasMetabot = getHasMetabot(
    databaseListState.data,
    modelListState.data,
    isMetabotEnabled,
  );
  const dispatch = useDispatch();

  useEffect(() => {
    if (!isSmallScreen()) {
      dispatch(openNavbar());
    }
  }, [dispatch]);

  useEffect(() => {
    if (dashboardId) {
      dispatch(replace(`/dashboard/${dashboardId}`));

      if (showHomepageRedirectRoast) {
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
  }, [dashboardId, showHomepageRedirectRoast, dispatch]);

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <HomeLayout hasMetabot={hasMetabot}>
      <HomeContent />
    </HomeLayout>
  );
};

const getHasMetabot = (
  databases: Database[] = [],
  models: CollectionItem[] = [],
  isMetabotEnabled = false,
) => {
  const hasModels = models.length > 0;
  const hasSupportedDatabases = databases.some(canUseMetabotOnDatabase);
  return hasModels && hasSupportedDatabases && isMetabotEnabled;
};
