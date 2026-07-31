import { useLayoutEffect } from "react";
import { t } from "ttag";

import { useUpdateSettingMutation } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useHomepageDashboard } from "metabase/home/use-homepage-dashboard";
import { useDispatch, useSelector } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { replace } from "metabase/router";
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
  const [updateSetting] = useUpdateSettingMutation();

  // This redirect must live inside a useLayoutEffect to prevent the browser from painting a frame of <HomeContent>
  // before firing the redirect (metabase#69917)
  useLayoutEffect(() => {
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
            action: () => {
              updateSetting({
                key: "dismissed-custom-dashboard-toast",
                value: true,
              });
            },
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
    updateSetting,
    dashboard?.archived,
    isLoading,
  ]);

  return {
    isLoadingDash: isLoading,
  };
};
