import { dashboardActionButtons } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/action-buttons";
import type {
  DashboardActionKey,
  DashboardHeaderButtonRowProps,
  HeaderButtonProps,
} from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/types";
import {
  getDashboardComplete,
  getHasModelActionsEnabled,
  getIsEditing,
} from "metabase/dashboard/selectors";
import { useSelector } from "metabase/lib/redux";
import { getPulseFormInput } from "metabase/pulse/selectors";
import {
  canManageSubscriptions as canManageSubscriptionsSelector,
  getUserIsAdmin,
} from "metabase/selectors/user";
import { Box } from "metabase/ui";

import { DASHBOARD_VIEW_ACTIONS, DASHBOARD_EDITING_ACTIONS } from "./constants";

export const DashboardHeaderButtonRow = ({
  dashboardActionKeys = null,
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

  const hasModelActionsEnabled = useSelector(getHasModelActionsEnabled);

  const isEditing = useSelector(getIsEditing);

  const buttonOptions = isEditing
    ? DASHBOARD_EDITING_ACTIONS
    : DASHBOARD_VIEW_ACTIONS;

  const visibleDashboardActionKeys = dashboardActionKeys
    ? buttonOptions.filter(key => dashboardActionKeys.includes(key))
    : buttonOptions;

  return (
    <>
      {visibleDashboardActionKeys.map(dashboardActionKey => {
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
            ...props,
          };

          if (config.enabled(buttonComponentProps)) {
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
