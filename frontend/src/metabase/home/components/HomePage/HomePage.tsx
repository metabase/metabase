import { useLayoutEffect } from "react";
import { t } from "ttag";

import { LoadingSkeleton } from "metabase/common/components/Skeletons";
import { useHomepageDashboard } from "metabase/home/use-homepage-dashboard";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { useNavigate } from "metabase/router";
import { useSetting, useUpdateSettingMutation } from "metabase/settings";
import { Flex, Skeleton, Stack } from "metabase/ui";

import { HomeContent } from "../HomeContent";
import { HomeLayout } from "../HomeLayout";

const DASHBOARD_HEADER_ACTIONS_COUNT = 6;

export const HomePage = (): JSX.Element => {
  const { isLoadingDash } = useDashboardRedirect();
  if (isLoadingDash) {
    return <HomepageDashboardSkeleton />;
  }

  return (
    <HomeLayout>
      <HomeContent />
    </HomeLayout>
  );
};

/** The header of the custom homepage dashboard the page is about to open. */
const HomepageDashboardSkeleton = () => (
  <LoadingSkeleton px={{ base: "1em", sm: "2em" }} pt="md" pb="0.75rem">
    <Flex
      justify="space-between"
      align="center"
      gap="md"
      data-testid="homepage-dashboard-skeleton"
    >
      <Stack gap="sm">
        <Skeleton h={24} w="14rem" radius="sm" />
        <Skeleton h={14} w="10rem" radius="sm" />
      </Stack>
      <Flex gap="sm">
        {Array.from({ length: DASHBOARD_HEADER_ACTIONS_COUNT }, (_, index) => (
          <Skeleton key={index} h="2rem" w="2rem" radius="sm" />
        ))}
      </Flex>
    </Flex>
  </LoadingSkeleton>
);

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
