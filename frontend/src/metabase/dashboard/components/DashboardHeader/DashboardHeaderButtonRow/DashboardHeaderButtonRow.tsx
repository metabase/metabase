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

export const DashboardHeaderButtonRow = ({
  dashboardActionKeys = Object.keys(
    dashboardActionButtons,
  ) as DashboardActionKey[],
  isPublic = false,
  isEmpty = false,
  isAnalyticsDashboard = false,
  ...props
}: {
  dashboardActionKeys?: DashboardActionKey[];
} & DashboardHeaderButtonRowProps) => {
  const formInput = useSelector(getPulseFormInput);
  const isAdmin = useSelector(getUserIsAdmin);
  const canManageSubscriptions = useSelector(canManageSubscriptionsSelector);

  const dashboard = useSelector(getDashboardComplete);
  const canEdit = Boolean(dashboard?.can_write && !dashboard?.archived);

  const hasModelActionsEnabled = useSelector(getHasModelActionsEnabled);

  const isEditing = useSelector(getIsEditing);

  return (
    <>
      {dashboardActionKeys.map(key => {
        const config = dashboardActionButtons[key];
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
            isEmpty,
            ...props,
          };

          if (config.enabled(buttonComponentProps)) {
            const Component = config.component;
            return <Component key={key} {...buttonComponentProps} />;
          }
        }
        return null;
      })}
    </>
  );
};
