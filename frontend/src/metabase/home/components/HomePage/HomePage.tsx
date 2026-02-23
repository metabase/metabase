import { useEffect } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useHomepageDashboard } from "metabase/common/hooks/use-homepage-dashboard";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { updateUserSetting } from "metabase/redux/settings";
import { addUndo } from "metabase/redux/undo";
import { useNavigation } from "metabase/routing";
import { getHasDismissedCustomHomePageToast } from "metabase/selectors/app";

import { HomeContent } from "../HomeContent";
import { HomeLayout } from "../HomeLayout";

export const HomePage = (): JSX.Element => {
  const { isLoadingDash } = useDashboardRedirect();
  if (isLoadingDash) {
    return <LoadingAndErrorWrapper loading={isLoadingDash} />;
  }

  return (
    <HomeLayout>
      <HomeContent />
    </HomeLayout>
  );
};

const useDashboardRedirect = () => {
  const { dashboardId, dashboard, isLoading } = useHomepageDashboard();
  const hasDismissedToast = useSelector(getHasDismissedCustomHomePageToast);
  const dispatch = useDispatch();
  const { replace } = useNavigation();

  useEffect(() => {
    if (dashboardId && !isLoading && !dashboard?.archived) {
      replace({
        pathname: `/dashboard/${dashboardId}`,
        state: { preserveNavbarState: true },
      });

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
    replace,
  ]);

  return {
    isLoadingDash: isLoading,
  };
};
