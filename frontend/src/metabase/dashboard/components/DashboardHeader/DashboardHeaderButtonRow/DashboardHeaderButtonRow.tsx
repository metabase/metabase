import { useCallback } from "react";

import { setSidebar } from "metabase/dashboard/actions";
import { dashboardActionButtons } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/action-buttons";
import type {
  DashboardActionKey,
  DashboardHeaderButtonRowProps,
  HeaderButtonProps,
} from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/types";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { useDashboardContext } from "metabase/dashboard/context";
import {
  getDashboardComplete,
  getHasModelActionsEnabled,
  getIsEditing,
} from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getPulseFormInput } from "metabase/notifications/pulse/selectors";
import {
  canManageSubscriptions as canManageSubscriptionsSelector,
  getUserIsAdmin,
} from "metabase/selectors/user";
import { Box } from "metabase/ui";

export const DashboardHeaderButtonRow = ({
  isPublic = false,
  isAnalyticsDashboard = false,
  ...props
}: {
  dashboardActionKeys?: DashboardActionKey[] | null;
} & DashboardHeaderButtonRowProps) => {
  const formInput = useSelector(getPulseFormInput);
  const isAdmin = useSelector(getUserIsAdmin);
  const canManageSubscriptions = useSelector(canManageSubscriptionsSelector);

  const dashboard = useSelector(getDashboardComplete);
  const canEdit = Boolean(dashboard?.can_write && !dashboard?.archived);

  const {
    isFullscreen,
    onFullscreenChange,
    downloadsEnabled,
    withSubscriptions,
    dashboardActions,
    refreshPeriod,
  } = useDashboardContext();

  const hasModelActionsEnabled = useSelector(getHasModelActionsEnabled);

  const isEditing = useSelector(getIsEditing);

  const visibleDashboardActionKeys = dashboardActions ?? [];
  const dispatch = useDispatch();

  const openSettingsSidebar = useCallback(() => {
    dispatch(setSidebar({ name: SIDEBAR_NAME.settings }));
  }, [dispatch]);

  return (
    <>
      {visibleDashboardActionKeys.map((dashboardActionKey) => {
        const config = dashboardActionButtons[dashboardActionKey];
        if (dashboard) {
          const buttonComponentProps: HeaderButtonProps = {
            isEditing,
            canEdit,
            hasModelActionsEnabled,
            isAnalyticsDashboard,
            dashboard,
            canManageSubscriptions,
            formInput,
            isAdmin,
            isPublic,
            openSettingsSidebar,
            ...props,
          };

          if (
            config.enabled({
              isFullscreen,
              onFullscreenChange,
              downloadsEnabled,
              withSubscriptions,
              refreshPeriod,
              ...buttonComponentProps,
            })
          ) {
            const Component = config.component;
            return (
              <Box
                key={dashboardActionKey}
                display="contents"
                data-testid="dashboard-header-row-button"
                data-element-id={dashboardActionKey}
              >
                <Component {...buttonComponentProps} />
              </Box>
            );
          }
        }
        return null;
      })}
    </>
  );
};
