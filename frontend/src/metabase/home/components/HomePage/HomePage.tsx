import { useEffect } from "react";
import { t } from "ttag";
import { replace } from "react-router-redux";
import { isSmallScreen } from "metabase/lib/dom";
import { openNavbar } from "metabase/redux/app";
import { addUndo, dismissUndo } from "metabase/redux/undo";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  useDatabaseListQuery,
  useSearchListQuery,
} from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { canUseMetabotOnDatabase } from "metabase/metabot/utils";
import { CollectionItem } from "metabase-types/api";
import Database from "metabase-lib/metadata/Database";
import { hasUserDismissedToast } from "metabase/selectors/user";
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
  const dashboardId = useSelector(getCustomHomePageDashboardId);
  const showHomepageRedirectRoast = useSelector(
    state => !hasUserDismissedToast(state, "custom_homepage_changed"),
  );
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
            actions: [dismissUndo],
            actionLabel: t`Got it`,
            hideDismiss: true,
          }),
        );
      }
    }
  }, [dashboardId, showHomepageRedirectRoast, dispatch, addUndo]);

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
