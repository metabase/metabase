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

import {
  getCustomHomePageDashboardId,
  getIsMetabotEnabled,
} from "../../selectors";
import { HomeLayout } from "../HomeLayout";
import { HomeContent } from "../HomeContent";

const SEARCH_QUERY = { models: "dataset", limit: 1 } as const;

export const HomePage = (): JSX.Element => {
  const { hasMetabot, isLoading, error } = useHasMetabot();
  useNavbar();
  useDashboardPage();

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <HomeLayout hasMetabot={hasMetabot}>
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

const useHasMetabot = () => {
  const isMetabotEnabled = useSelector(getIsMetabotEnabled);
  const {
    data: databases = [],
    isLoading: isDatabaseLoading,
    error: databaseError,
  } = useDatabaseListQuery({
    enabled: isMetabotEnabled,
  });
  const {
    data: models = [],
    isLoading: isModelLoading,
    error: modelError,
  } = useSearchListQuery({
    query: SEARCH_QUERY,
    enabled: isMetabotEnabled,
  });

  const hasModels = models.length > 0;
  const hasSupportedDatabases = databases.some(canUseMetabotOnDatabase);
  const hasMetabot = hasModels && hasSupportedDatabases && isMetabotEnabled;
  const isLoading = isDatabaseLoading || isModelLoading;
  const error = databaseError ?? modelError;

  return { hasMetabot, isLoading, error };
};

const useDashboardPage = () => {
  const dashboardId = useSelector(getCustomHomePageDashboardId);
  const hasDismissedToast = useSelector(state =>
    getSetting(state, "dismissed-custom-dashboard-toast"),
  );
  const dispatch = useDispatch();

  useEffect(() => {
    if (dashboardId) {
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
  }, [dashboardId, hasDismissedToast, dispatch]);
};
