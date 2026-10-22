import { type JSX, useLayoutEffect } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useHomepageDashboard } from "metabase/home/use-homepage-dashboard";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { useNavigate } from "metabase/router";
import { useSetting, useUpdateSettingMutation } from "metabase/settings";

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
  const hasDismissedToast = useSetting("dismissed-custom-dashboard-toast");
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [updateSetting] = useUpdateSettingMutation();

  // This redirect must live inside a useLayoutEffect to prevent the browser from painting a frame of <HomeContent>
  // before firing the redirect (metabase#69917)
  useLayoutEffect(() => {
    if (dashboardId && !isLoading && !dashboard?.archived) {
      navigate(`/dashboard/${dashboardId}`, {
        replace: true,
        state: { preserveNavbarState: true },
      });

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
    navigate,
    updateSetting,
    dashboard?.archived,
    isLoading,
  ]);

  return {
    isLoadingDash: isLoading,
  };
};
