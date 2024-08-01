import {
  DASHBOARD_DISPLAY_ACTIONS,
  DASHBOARD_EDITING_ACTIONS,
  SDK_DASHBOARD_VIEW_ACTIONS,
} from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/constants";

export const getDashboardActions = ({
  withEdit,
  isEditing,
}: {
  withEdit: boolean;
  isEditing: boolean;
}) => {
  if (withEdit && isEditing) {
    return DASHBOARD_EDITING_ACTIONS;
  } else if (withEdit) {
    return SDK_DASHBOARD_VIEW_ACTIONS;
  } else {
    return DASHBOARD_DISPLAY_ACTIONS;
  }
};
